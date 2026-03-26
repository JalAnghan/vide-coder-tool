import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import TaskList from './components/TaskList';
import AddTaskForm from './components/AddTaskForm';
import { fetchTasks, createTask, deleteTask } from './api/taskApi';
import './styles/App.css';

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      const data = await fetchTasks();
      setTasks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleAddTask(title) {
    const newTask = { id: Date.now(), title, completed: false };
    setTasks([...tasks, newTask]);
    createTask(newTask);
  }

  function handleDeleteTask(taskId) {
    setTasks(tasks.filter(t => t.id !== taskId));
    deleteTask(taskId);
  }

  function handleToggleTask(taskId) {
    setTasks(tasks.map(t =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    ));
  }

  const filteredTasks = tasks.filter(task => {
    if (filter === 'active') return !task.completed;
    if (filter === 'completed') return task.completed;
    return true;
  });

  return (
    <div className="app">
      <Header
        taskCount={tasks.length}
        completedCount={tasks.filter(t => t.completed).length}
      />
      <AddTaskForm onAdd={handleAddTask} />
      {loading && <div className="spinner">Loading...</div>}
      {error && <div className="error">{error}</div>}
      <TaskList
        tasks={filteredTasks}
        onDelete={handleDeleteTask}
        onToggle={handleToggleTask}
      />
    </div>
  );
}

export default App;
