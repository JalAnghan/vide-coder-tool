import React from 'react';

function TaskItem({ task, onDelete, onToggle }) {
  function handleCheckboxChange() {
    onToggle(task.id);
  }

  function handleDeleteClick(event) {
    event.stopPropagation();
    onDelete(task.id);
  }

  return (
    <li className={`task-item ${task.completed ? 'completed' : ''}`}>
      <input
        type="checkbox"
        checked={task.completed}
        onChange={handleCheckboxChange}
      />
      <span className="task-title">{task.title}</span>
      <button className="delete-btn" onClick={handleDeleteClick}>
        Delete
      </button>
    </li>
  );
}

export default TaskItem;
