import React, { createContext, useState } from 'react';

export const ThemeContext = createContext();

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');

  function toggleTheme() {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export default ThemeProvider;
