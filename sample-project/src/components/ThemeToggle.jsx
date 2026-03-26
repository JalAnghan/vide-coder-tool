import React, { useState, useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

function ThemeToggle() {
  const { theme, toggleTheme } = useContext(ThemeContext);

  function handleToggleClick() {
    toggleTheme();
  }

  return (
    <button className="theme-toggle" onClick={handleToggleClick}>
      {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}

export default ThemeToggle;
