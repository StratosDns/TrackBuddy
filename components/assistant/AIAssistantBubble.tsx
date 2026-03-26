'use client';

import { useState } from 'react';
import { Bot, Send, X } from 'lucide-react';

interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIAssistantBubble() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { role: 'assistant', content: 'Ask me a quick nutrition or gym question.' },
  ]);

  async function askAssistant() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || loading) return;

    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: trimmedQuestion }]);
    setQuestion('');

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedQuestion }),
      });
      const payload = await response.json();
      const answer = typeof payload.answer === 'string'
        ? payload.answer
        : 'I can help with nutrition and gym basics only.';
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Unable to answer right now. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed z-50 bottom-24 right-4 md:bottom-5 md:right-5">
      {open ? (
        <div className="w-72 sm:w-80 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">AI Coach</p>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="Close assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="h-52 overflow-y-auto px-3 py-2 space-y-2 bg-gray-50">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs ${
                  message.role === 'assistant'
                    ? 'bg-white border border-gray-200 text-gray-700'
                    : 'ml-auto bg-green-600 text-white'
                }`}
              >
                {message.content}
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-gray-100 flex items-center gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') askAssistant(); }}
              placeholder="Ask nutrition/gym..."
              className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-green-200 focus:border-green-500"
            />
            <button
              onClick={askAssistant}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-green-600 text-white p-2 disabled:opacity-60"
              aria-label="Send question"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-12 h-12 rounded-full bg-green-600 text-white shadow-lg flex items-center justify-center hover:bg-green-700 transition-colors"
          aria-label="Open assistant"
          title="AI Coach"
        >
          <Bot className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
