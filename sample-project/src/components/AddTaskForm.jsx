import React, { useState } from 'react';

function AddTaskForm({ onAdd }) {
  const [title, setTitle] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (title.trim()) {
      onAdd(title.trim());
      setTitle('');
    }
  }

  function handleInputChange(event) {
    setTitle(event.target.value);
  }

  return (
    <form className="add-task-form" onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={handleInputChange}
        placeholder="Add a new task..."
      />
      <button type="submit">Add Task</button>
    </form>
  );
}

export default AddTaskForm;
