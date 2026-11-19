import { Alert, Button, Checkbox, Group, NumberInput, Paper, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import type { AppConfig } from '../../../server/src/types';

interface SettingsFormProps {
  initialNtfyServerAddress: string;
  hasNtfyBearerToken: boolean;
  initialCheckInterval: number;
  initialDefaultNtfyTopic: string;
  onSubmit: (settings: Omit<AppConfig, 'feeds'>) => Promise<void>;
}

export function SettingsForm({
  initialNtfyServerAddress,
  hasNtfyBearerToken,
  initialCheckInterval,
  initialDefaultNtfyTopic,
  onSubmit,
}: SettingsFormProps) {
  const [submitError, setSubmitError] = useState('');
  const form = useForm({
    initialValues: {
      ntfyServerAddress: initialNtfyServerAddress,
      ntfyBearerToken: '',
      removeNtfyBearerToken: false,
      checkInterval: initialCheckInterval,
      defaultNtfyTopic: initialDefaultNtfyTopic,
    },
    validate: {
      ntfyServerAddress: (value) =>
        !value || value.trim().length === 0 ? 'Ntfy server address is required' : null,
      checkInterval: (value) =>
        !value || value < 1 ? 'Check interval must be at least 1 minute' : null,
      defaultNtfyTopic: (value) =>
        !value || value.trim().length === 0 ? 'Default ntfy topic is required' : null,
    },
  });

  const { setValues } = form;
  useEffect(() => {
    setValues({
      ntfyServerAddress: initialNtfyServerAddress,
      checkInterval: initialCheckInterval,
      defaultNtfyTopic: initialDefaultNtfyTopic,
    });
  }, [setValues, initialNtfyServerAddress, initialCheckInterval, initialDefaultNtfyTopic]);

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitError('');
    try {
      await onSubmit({
        ntfyServerAddress: values.ntfyServerAddress,
        checkIntervalMinutes: values.checkInterval,
        defaultNtfyTopic: values.defaultNtfyTopic,
        ntfyBearerToken: values.removeNtfyBearerToken ? '' : values.ntfyBearerToken.trim() || undefined,
      });
      form.setValues({ ntfyBearerToken: '', removeNtfyBearerToken: false });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save settings');
    }
  });

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        {/* Notification Settings Section */}
        <Paper withBorder p="md">
          <Stack>
            <Text fw={500} size="sm">Ntfy Settings</Text>
            <TextInput
              label="Server Address"
              placeholder="https://ntfy.sh"
              required
              {...form.getInputProps('ntfyServerAddress')}
            />
            <TextInput
              label="Default Topic"
              placeholder="rss"
              description="Used when a feed doesn't have a specific topic configured"
              required
              {...form.getInputProps('defaultNtfyTopic')}
            />
            <PasswordInput
              label="Bearer Token"
              description={hasNtfyBearerToken ? 'Leave blank to keep the saved token' : 'Optional access token for protected topics'}
              autoComplete="new-password"
              disabled={form.values.removeNtfyBearerToken}
              {...form.getInputProps('ntfyBearerToken')}
            />
            {hasNtfyBearerToken && (
              <Checkbox
                label="Remove saved token"
                {...form.getInputProps('removeNtfyBearerToken', { type: 'checkbox' })}
              />
            )}
          </Stack>
        </Paper>

        {/* Feed Check Settings Section */}
        <Paper withBorder p="md">
          <Stack>
            <Text fw={500} size="sm">Monitoring Settings</Text>
            <NumberInput
              label="Check Interval"
              description="How often to check feeds for new posts (in minutes)"
              placeholder="15"
              min={1}
              required
              {...form.getInputProps('checkInterval')}
            />
          </Stack>
        </Paper>

        {submitError && <Alert color="red" role="alert">{submitError}</Alert>}
        <Group justify="flex-end" mt="md">
          <Button type="submit">Save Settings</Button>
        </Group>
      </Stack>
    </form>
  );
}
