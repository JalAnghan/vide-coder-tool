import React from 'react';
import Navigation from './Navigation';
import ThemeToggle from './ThemeToggle';

function Header({ taskCount, completedCount }) {
  function handleLogoClick() {
    window.scrollTo(0, 0);
  }

  return (
    <header className="header">
      <div className="logo" onClick={handleLogoClick}>
        <h1>Task Manager</h1>
      </div>
      <Navigation />
      <div className="header-stats">
        <span>{completedCount}/{taskCount} completed</span>
      </div>
      <ThemeToggle />
    </header>
  );
}

export default Header;
