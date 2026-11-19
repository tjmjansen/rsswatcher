import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Modal, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { IconExternalLink, IconBell } from '@tabler/icons-react';
import type { FeedHistory as FeedHistoryType, FeedHistoryEntry } from '../../../server/src/types';

export function FeedHistory() {
  const [history, setHistory] = useState<FeedHistoryType>({ entries: [], maxEntries: 1000 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(false);

  const clearHistory = async () => {
    setClearing(true);
    setClearError(false);
    try {
      const response = await fetch('/api/history', { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to clear history');
      }
      setHistory(current => ({ ...current, entries: [] }));
      setConfirmOpen(false);
    } catch (error) {
      console.error('Failed to clear history:', error);
      setClearError(true);
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    if (clearing) return;

    const controller = new AbortController();
    const fetchHistory = async () => {
      try {
        const response = await fetch('/api/history', { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Failed to fetch history');
        }
        const data: FeedHistoryType = await response.json();
        if (!controller.signal.aborted) setHistory(data);
      } catch (error) {
        if (!controller.signal.aborted) console.error('Failed to fetch history:', error);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [clearing]);

  const closeConfirmation = () => {
    if (!clearing) {
      setConfirmOpen(false);
      setClearError(false);
    }
  };

  return (
    <Stack h="100%" style={{ flex: 1 }}>
      <Group justify="space-between" mb="md">
        <Text size="xl">Feed History</Text>
        <Button color="red" variant="light" disabled={history.entries.length === 0} onClick={() => setConfirmOpen(true)}>
          Clear History
        </Button>
      </Group>

      <Modal opened={confirmOpen} onClose={closeConfirmation} title="Clear feed history?">
        <Stack>
          <Text size="sm">
            This clears the history for all feeds. The next check can send notifications again for matching posts that are still in the feeds.
          </Text>
          {clearError && <Alert color="red" role="alert">Failed to clear history. Please try again.</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeConfirmation} disabled={clearing} data-autofocus>Cancel</Button>
            <Button color="red" onClick={clearHistory} loading={clearing}>Clear History</Button>
          </Group>
        </Stack>
      </Modal>

      <ScrollArea style={{ flex: 1 }}>
        <Table striped highlightOnHover>
          <thead>
            <tr>
              <th>Feed URL</th>
              <th>Title</th>
              <th>Checked At</th>
              <th>Keywords Matched</th>
              <th>Notification</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(history.entries || []).map((entry: FeedHistoryEntry, index) => (
              <tr key={`${entry.feedUrl}-${entry.title}-${entry.checkedAt}-${index}`}>
                <td>
                  <Text size="sm" lineClamp={1}>
                    {entry.feedUrl}
                  </Text>
                </td>
                <td>
                  <Text size="sm" lineClamp={1}>
                    {entry.title}
                  </Text>
                </td>
                <td>
                  <Text size="sm">
                    {new Date(entry.checkedAt).toLocaleString()}
                  </Text>
                </td>
                <td>
                  <Group gap={4}>
                    {entry.matchedKeywords.map((keyword, idx) => (
                      <Badge key={idx} size="sm">
                        {keyword}
                      </Badge>
                    ))}
                  </Group>
                </td>
                <td>
                  {entry.notificationSent && (
                    <Badge color="green" leftSection={<IconBell size={14} />}>
                      Sent
                    </Badge>
                  )}
                </td>
                <td>
                  <Group gap={4}>
                    <ActionIcon
                      component="a"
                      href={entry.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                      variant="subtle"
                    >
                      <IconExternalLink size={16} />
                    </ActionIcon>
                  </Group>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}
