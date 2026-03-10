import React from 'react';

interface LinkResultProps {
  url: string;
  onCopy: () => void;
  isCopied: boolean;
  itemCount: number;
  truncated?: boolean;
  totalCount?: number;
}

export function LinkResult({ url, onCopy, isCopied, itemCount, truncated, totalCount }: LinkResultProps) {
  return (
    <div className="link-result">
      <div className="link-result-header">
        Share link created!{' '}
        {truncated && totalCount ? (
          <span className="budget-message" style={{ display: 'inline' }}>
            ({itemCount} of {totalCount} tabs — URL budget limit)
          </span>
        ) : (
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            ({itemCount} tab{itemCount !== 1 ? 's' : ''})
          </span>
        )}
      </div>
      <input
        type="text"
        className="link-input"
        value={url}
        readOnly
        onClick={(e) => (e.target as HTMLInputElement).select()}
      />
      <div className="link-actions">
        <button
          className={`btn ${isCopied ? 'btn-secondary' : 'btn-primary'}`}
          onClick={onCopy}
        >
          {isCopied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}
