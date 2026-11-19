import type Parser from 'rss-parser';
import type { FeedConfig, NotificationSettings, NtfyPriority } from 'shared/types.js';

export type { FeedConfig, NotificationSettings, NtfyPriority };

export interface RssItemCustomFields {
  'dc:content'?: string;
  'content:encoded'?: string;
}

export interface RssItem extends Parser.Item {
  guid?: string;
  'dc:content'?: string;
  'content:encoded'?: string;
}

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  content: string;
  summary: string;
  contentSnippet: string;
  pubDate: string;
}

export interface FeedStatus {
  lastCheck: string;
  isChecking: boolean;
  error?: string;
}

export interface FeedHistory {
  entries: FeedHistoryEntry[];
  maxEntries: number;
}

export interface FeedHistoryEntry extends FeedItem {
  feedUrl: string;
  checkedAt: string;
  notificationSent: boolean;
  matchedKeywords: string[];
}

export interface AppConfig {
  feeds: FeedConfig[];
  ntfyServerAddress: string;
  ntfyBearerToken?: string;
  checkIntervalMinutes: number;
  defaultNtfyTopic: string;
}

export interface PublicAppConfig extends Omit<AppConfig, 'ntfyBearerToken'> {
  hasNtfyBearerToken: boolean;
}

export interface PostHistory {
    [postGuid: string]: {
        feedUrl: string;
        checkedAt: string;  // ISO string timestamp
        title: string;
        link: string;
        matchedKeywords: string[];
        notificationSent: boolean;
    };
}
