
import React, { useState } from 'react';
import { Button } from './common/Button';
import { TextInput } from './common/TextInput';

interface ApiKeyInputProps {
  onSubmit: (apiKey: string) => void;
  initialApiKey?: string;
  error?: string | null;
  isLoading?: boolean;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ onSubmit, initialApiKey = '', error, isLoading }) => {
  const [key, setKey] = useState(initialApiKey);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
      onSubmit(key.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <TextInput
        label="Gemini API Key"
        id="apiKey"
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Enter your Gemini API Key"
        required
        tooltip="Your Gemini API key is required to access PlantPal's features. It is stored locally in your browser."
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" variant="primary" size="md" isLoading={isLoading} className="w-full">
        Validate & Proceed
      </Button>
    </form>
  );
};
