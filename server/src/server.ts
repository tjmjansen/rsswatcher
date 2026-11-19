import express from 'express';
import cors from 'cors';
import { ConfigManager } from './config.js';
import { FeedMonitor } from './feedMonitor.js';
import { AppConfig, PublicAppConfig } from './types.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { Socket } from 'net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Server {
  private app: express.Application;
  private configManager: ConfigManager;
  private feedMonitor: FeedMonitor;
  private server?: ReturnType<typeof express.application.listen>;
  private connections: Set<Socket> = new Set();

  constructor() {
    this.app = express();
    this.configManager = new ConfigManager();
    this.feedMonitor = new FeedMonitor(this.configManager);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(cors());
  }

  private async setupVite() {
    if (process.env.NODE_ENV === 'development') {
      // In development, integrate Vite's dev middleware
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
        root: path.resolve(__dirname, '../../client'),
      });

      this.app.use(vite.middlewares);
    } else {
      // In production, serve the built files from dist/client
      const clientDist = path.resolve(__dirname, '../client');
      this.app.use(express.static(clientDist));
      this.app.get('*', (_req, res) => {
        res.sendFile(path.resolve(clientDist, 'index.html'));
      });
    }
  }

  private setupRoutes() {
    // Get current configuration
    this.app.get('/api/config', (_req, res) => {
      try {
        const { ntfyBearerToken, ...config } = this.configManager.getConfig();
        const publicConfig: PublicAppConfig = { ...config, hasNtfyBearerToken: Boolean(ntfyBearerToken) };
        res.json(publicConfig);
      } catch (error) {
        console.error('Failed to get configuration:', error);
        res.status(500).json({ error: 'Failed to get configuration' });
      }
    });

    // Get feed history
    this.app.get('/api/history', (_req, res) => {
      try {
        const history = {
          entries: this.feedMonitor.getPostHistoryEntries(),
          maxEntries: 1000
        };
        res.json(history);
      } catch (error) {
        console.error('Failed to get history:', error);
        res.status(500).json({ error: 'Failed to get history' });
      }
    });

    this.app.delete('/api/history', async (_req, res) => {
      try {
        await this.feedMonitor.clearHistory();
        res.sendStatus(204);
      } catch (error) {
        console.error('Failed to clear history:', error);
        res.status(500).json({ error: 'Failed to clear history' });
      }
    });

    // Update configuration
    this.app.post('/api/config', (req, res) => {
      try {
        const { feeds, ntfyServerAddress, checkIntervalMinutes, defaultNtfyTopic, ntfyBearerToken }: AppConfig = req.body;
        if (ntfyBearerToken !== undefined && (
          typeof ntfyBearerToken !== 'string' || !/^(?:[A-Za-z0-9._~+/-]+=*)?$/.test(ntfyBearerToken)
        )) {
          res.status(400).json({ error: 'Enter a valid bearer token without the Bearer prefix.' });
          return;
        }

        this.configManager.updateConfig({
          feeds,
          ntfyServerAddress,
          checkIntervalMinutes,
          defaultNtfyTopic,
          ntfyBearerToken: ntfyBearerToken === undefined
            ? this.configManager.getConfig().ntfyBearerToken
            : ntfyBearerToken || undefined,
        });
        this.feedMonitor.updateConfig();
        res.json({ success: true });
      } catch (error) {
        console.error('Failed to update configuration:', error);
        res.status(500).json({ error: 'Failed to update configuration' });
      }
    });

    // Get feed status
    this.app.get('/api/status', (_req, res) => {
      try {
        const status = this.feedMonitor.getStatus();
        res.json(status);
      } catch (error) {
        console.error('Failed to get status:', error);
        res.status(500).json({ error: 'Failed to get status' });
      }
    });

    // Force check feeds
    this.app.post('/api/check', async (_req, res) => {
      try {
        await this.feedMonitor.checkFeeds();
        res.json({ success: true });
      } catch (error) {
        console.error('Failed to check feeds:', error);
        res.status(500).json({ error: 'Failed to check feeds' });
      }
    });

    // Send test notification
    this.app.post('/api/test-notification', async (req, res) => {
      try {
        await this.feedMonitor.sendTestNotification(req.body.topic);
        res.json({ success: true });
      } catch (error) {
        console.error('Failed to send test notification:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
      }
    });
  }

  public async start(port: number = 3000) {
    await this.setupVite();
    this.server = this.app.listen(port, () => {
      console.log(`
╔═══════════════════════════════════════════╗
║  RSS Watcher                              ║
╚═══════════════════════════════════════════╝
🚀 Server is running on port ${port}
📡 Mode: ${process.env.NODE_ENV || 'production'}

Monitoring your feeds! 📰
`);
    });

    // Track all connections
    this.server.on('connection', (conn) => {
      this.connections.add(conn);
      conn.on('close', () => this.connections.delete(conn));
    });
  }

  public async stop() {
    console.log('Stopping feed monitor...');
    this.feedMonitor.stop();
    
    if (this.server) {
      console.log('Closing HTTP server...');
      for (const conn of this.connections) {
        conn.destroy();
      }

      return new Promise<void>((resolve, reject) => {
        this.server!.close((err) => {
          if (err) {
            console.error('Error while closing HTTP server:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  }
}
