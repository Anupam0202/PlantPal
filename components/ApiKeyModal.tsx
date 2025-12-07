import React, { useState } from 'react';
import { CloseIcon, SparklesIcon } from '../constants';

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (apiKey: string) => void;
    errorMessage?: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
    isOpen,
    onClose,
    onSave,
    errorMessage,
}) => {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (apiKey.trim()) {
            onSave(apiKey.trim());
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in border border-slate-200 dark:border-slate-700">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    aria-label="Close"
                >
                    <CloseIcon className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-lg">
                        <SparklesIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                            Add Your API Key
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Continue using PlantPal with your own key
                        </p>
                    </div>
                </div>

                {/* Error Message */}
                {errorMessage && (
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg">
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                            <strong>⚠️ API Quota Exceeded:</strong> {errorMessage}
                        </p>
                    </div>
                )}

                {/* Info */}
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                        <strong>Why do you need an API key?</strong>
                        <br />
                        The default API key has reached its usage limit. You can get your own free API key from Google AI Studio.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label
                            htmlFor="api-key-input"
                            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                        >
                            Gemini API Key
                        </label>
                        <div className="relative">
                            <input
                                id="api-key-input"
                                type={showKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Enter your API key (starts with AIza...)"
                                className="w-full px-4 py-3 pr-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-transparent transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm"
                            >
                                {showKey ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </div>

                    {/* Get API Key Link */}
                    <div className="text-center">
                        <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline"
                        >
                            🔑 Get a free API key from Google AI Studio →
                        </a>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!apiKey.trim()}
                            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                        >
                            Save & Continue
                        </button>
                    </div>
                </form>

                {/* Privacy Note */}
                <p className="mt-4 text-xs text-center text-slate-400 dark:text-slate-500">
                    🔒 Your API key is stored locally in your browser and never sent to our servers.
                </p>
            </div>
        </div>
    );
};
