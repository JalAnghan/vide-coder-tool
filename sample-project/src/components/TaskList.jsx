import React from 'react';
import TaskItem from './TaskItem';
import EmptyState from './EmptyState';

function TaskList({ tasks, onDelete, onToggle }) {
  if (tasks.length === 0) {
    return <EmptyState message="No tasks yet. Add one above!" />;
  }

  return (
    <ul className="task-list">
      {tasks.map(task => (
        <TaskItem
          key={task.id}
          task={task}
          onDelete={onDelete}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

export default TaskList;
