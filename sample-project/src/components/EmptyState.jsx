import React from 'react';

function EmptyState({ message }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <p>{message}</p>
    </div>
  );
}

export default EmptyState;
