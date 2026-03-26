const API_BASE = 'https://api.example.com';

export async function fetchTasks() {
  const response = await fetch(`${API_BASE}/tasks`);
  if (!response.ok) throw new Error('Failed to fetch tasks');
  return response.json();
}

export async function createTask(task) {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  return response.json();
}

export async function updateTask(taskId, updates) {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return response.json();
}

export async function deleteTask(taskId) {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
  });
  return response.json();
}
