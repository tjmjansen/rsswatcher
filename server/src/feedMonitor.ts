import Parser from 'rss-parser';
import cron from 'node-cron';
import fetch from 'node-fetch';
import { FeedItem, FeedStatus, FeedHistory, FeedHistoryEntry, RssItemCustomFields, RssItem, FeedConfig } from './types.js';
import { ConfigManager } from './config.js';
import { PostHistoryManager } from './postHistory.js';

export class FeedMonitor {
  private parser: Parser<object, RssItemCustomFields>;
  private configManager: ConfigManager;
  private cronJob?: cron.ScheduledTask;
  private status: Record<string, FeedStatus> = {};
  private history: FeedHistory = {
    entries: [],
    maxEntries: 1000 // Store up to 1000 entries
  };
  private postHistoryManager: PostHistoryManager;
  private pendingHistoryOperation = Promise.resolve();

  constructor(configManager: ConfigManager) {
    this.parser = new Parser<object, RssItemCustomFields>({
      customFields: {
        item: [
          ['dc:content', 'dc:content'],
          ['content:encoded', 'content:encoded']
        ]
      }
    });
    this.configManager = configManager;
    this.postHistoryManager = new PostHistoryManager();
    
    // Initialize status for configured feeds
    const config = this.configManager.getConfig();
    config.feeds.forEach((feed: FeedConfig) => {
      this.status[feed.url] = {
        lastCheck: new Date(0).toISOString(),
        isChecking: false,
        error: undefined
      };
    });
    
    this.setupCronJob();
  }

  private setupCronJob() {
    const config = this.configManager.getConfig();
    if (this.cronJob) {
      this.cronJob.stop();
    }

    // Ensure we have a valid check interval
    const checkInterval = Math.max(1, config.checkIntervalMinutes || 15);

    // Convert minutes to cron expression
    const cronExpression = `*/${checkInterval} * * * *`;
    this.cronJob = cron.schedule(cronExpression, () => {
      this.checkFeeds().catch(console.error);
    });
  }

  private async checkFeed(url: string, keywords: string[]): Promise<void> {
    const config = this.configManager.getConfig();
    const feedConfig = config.feeds.find(f => f.url === url);
    if (!feedConfig) return;

    this.status[url] = {
      lastCheck: new Date().toISOString(),
      isChecking: true
    };

    try {
      const feed = await this.parser.parseURL(url);
      const checkedAt = new Date().toISOString();
      for (const item of feed.items as RssItem[]) {
        if (item.guid && this.postHistoryManager.isPostChecked(item.guid)) {
          continue;
        }

        const text = `${item.title || ''} ${item['dc:content'] || ''} ${item.content || ''} ${item.summary || ''} ${item.contentSnippet || ''} ${item['content:encoded'] || ''}`.toLowerCase();
        const matchedKeywords = keywords.filter(keyword =>
          text.includes(keyword.toLowerCase())
        );
        const title = (item.title || '').trim();
        const link = item.link || '';
        const shouldNotify = keywords.length === 0 || matchedKeywords.length > 0;
        if (shouldNotify) {
          const notification: FeedItem = {
            title,
            link,
            description: item['dc:content'] || item['content:encoded'] || item.content || item.summary || item.contentSnippet || '',
            content: item['dc:content'] || item['content:encoded'] || item.content || '',
            summary: item.summary || '',
            contentSnippet: item.contentSnippet || '',
            pubDate: item.pubDate || ''
          };
          const notificationKeywords = keywords.filter(keyword =>
            `${notification.title} ${notification.content}`.toLowerCase().includes(keyword.toLowerCase())
          );
          await this.sendNotification(notification, notificationKeywords, feedConfig);
          this.addToHistory({ ...notification, feedUrl: url, checkedAt, notificationSent: true, matchedKeywords: notificationKeywords });
        }

        if (item.guid) {
          this.postHistoryManager.addCheckedPost(item.guid, url, title, link, matchedKeywords, shouldNotify);
        }
      }

      this.status[url] = {
        lastCheck: checkedAt,
        isChecking: false
      };
    } catch (error) {
      this.status[url] = {
        lastCheck: new Date().toISOString(),
        isChecking: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.error(`Error checking feed ${url}:`, error);
    }
  }

  private addToHistory(entry: FeedHistoryEntry) {
    this.history.entries.unshift(entry);
    if (this.history.entries.length > this.history.maxEntries) {
      this.history.entries.pop();
    }
  }

  private async sendNotification(item: FeedItem, matchedKeywords: string[], feedConfig: FeedConfig) {
    const config = this.configManager.getConfig();
    const settings = feedConfig.notificationSettings;
    const ntfyTopic = settings.ntfyTopic || config.defaultNtfyTopic;
    const ntfyUrl = `${config.ntfyServerAddress}/${ntfyTopic}`;
    
    // Determine title
    const title = settings.usePostTitle ? item.title : (settings.customTitle || "");
    const sanitizedTitle = title.replace(/[^\x20-\x7E]/g, '');
    
    // Determine description
    let description = settings.usePostDescription ? item.description : (settings.customDescription || "");
    if (settings.appendLink && item.link) {
      description = `${description}\n\n${item.link}`;
    }
    
    console.log(`🔔 Sending notification: "${sanitizedTitle}" to ${ntfyUrl}`);
    const headers: Record<string, string> = {
      'Title': sanitizedTitle,
      'Priority': settings.priority,
    };

    if (config.ntfyBearerToken) {
      headers['Authorization'] = `Bearer ${config.ntfyBearerToken}`;
    }

    // Add tags if enabled
    if (settings.includeKeywordTags && matchedKeywords.length > 0) {
      headers['Tags'] = matchedKeywords.join(',');
    }

    // Add Open action if enabled
    if (settings.includeOpenAction && item.link) {
      headers['Actions'] = `view, Open, ${item.link}`;
    }

    const response = await fetch(ntfyUrl, {
      method: 'POST',
      body: description,
      headers,
    });
    await response.arrayBuffer();
    if (!response.ok) {
      throw new Error(`ntfy rejected the notification (HTTP ${response.status})`);
    }
  }

  private runHistoryOperation(operation: () => void | Promise<void>): Promise<void> {
    const result = this.pendingHistoryOperation.then(operation);
    this.pendingHistoryOperation = result.catch(() => {});
    return result;
  }

  public checkFeeds(): Promise<void> {
    return this.runHistoryOperation(async () => {
      const { feeds } = this.configManager.getConfig();
      await Promise.all(feeds.map(feed => this.checkFeed(feed.url, feed.keywords)));
    });
  }

  public clearHistory(): Promise<void> {
    return this.runHistoryOperation(() => {
      this.postHistoryManager.clearHistory();
      this.history.entries = [];
    });
  }

  public getStatus(): Record<string, FeedStatus> {
    return { ...this.status };
  }

  public updateConfig() {
    const config = this.configManager.getConfig();
    this.setupCronJob();
    
    // Get current config and URLs
    const configuredUrls = new Set(config.feeds.map((feed: FeedConfig) => feed.url));
    
    // Remove status entries for feeds that are no longer in the config
    Object.keys(this.status).forEach(url => {
      if (!configuredUrls.has(url)) {
        delete this.status[url];
      }
    });
    
    // Initialize status entries for all configured feeds
    config.feeds.forEach((feed: FeedConfig) => {
      if (!this.status[feed.url]) {
        this.status[feed.url] = {
          lastCheck: new Date(0).toISOString(),
          isChecking: false,
          error: undefined
        };
      }
    });
  }

  public stop() {
    if (this.cronJob) {
      this.cronJob.stop();
    }
  }

  public getHistory(): FeedHistory {
    return { ...this.history };
  }

  public getPostHistoryEntries(): FeedHistoryEntry[] {
    return this.postHistoryManager.getPostHistoryEntries();
  }

  public async sendTestNotification(topic?: string): Promise<void> {
    const config = this.configManager.getConfig();
    const testItem: FeedItem = {
      title: "Test Notification",
      description: "This is a test notification from your RSS Feed Monitor",
      content: "This is a test notification from your RSS Feed Monitor",
      summary: "This is a test notification from your RSS Feed Monitor",
      contentSnippet: "This is a test notification from your RSS Feed Monitor",
      link: config.ntfyServerAddress,
      pubDate: new Date().toISOString()
    };

    const testConfig: FeedConfig = {
      url: "test",
      keywords: [],
      notificationSettings: {
        usePostTitle: true,
        usePostDescription: true,
        appendLink: true,
        priority: 'default',
        includeKeywordTags: true,
        includeOpenAction: true,
        ntfyTopic: topic || config.defaultNtfyTopic
      }
    };

    await this.sendNotification(testItem, ["keyword1", "keyword2"], testConfig);
  }
}
