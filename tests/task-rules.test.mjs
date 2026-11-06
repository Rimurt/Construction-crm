import assert from 'node:assert/strict';
import test from 'node:test';
import { availableActions } from '../src/types.ts';
import { lastStatusUpdate } from '../src/presentation.ts';
import { archiveDemoRecord, changeDemoStatus, createDemo, saveDemoTask } from '../src/demo.ts';

test('исполнителю доступны только его переходы, постановщику — только решения по проверке', () => {
  const data = createDemo();
  const [manager, first, second] = data.profiles;
  const task = data.tasks[0];
  assert.deepEqual(availableActions({ ...task, status: 'new' }, first), ['in_progress']);
  assert.deepEqual(availableActions({ ...task, status: 'rework' }, first), ['in_progress']);
  assert.deepEqual(availableActions({ ...task, status: 'in_progress' }, first), ['review']);
  assert.deepEqual(availableActions({ ...task, status: 'review' }, first), []);
  assert.deepEqual(availableActions({ ...task, status: 'accepted' }, first), []);
  assert.deepEqual(availableActions({ ...task, status: 'new' }, second), []);
  assert.deepEqual(availableActions({ ...task, status: 'review' }, manager), [
    'accepted',
    'rework',
  ]);
  assert.deepEqual(availableActions({ ...task, status: 'in_progress' }, manager), []);
});

test('дата статуса определяется по истории своей задачи, независимо от порядка записей', () => {
  const data = createDemo();
  const task = data.tasks[0];
  const before = lastStatusUpdate(task, data.history);
  assert.equal(lastStatusUpdate(task, [...data.history].reverse()), before);
  const changed = changeDemoStatus(data, task, 'rework', 'Исправить угол', data.profiles[0].id);
  assert.equal(
    lastStatusUpdate(changed.tasks[0], changed.history),
    changed.history.at(-1).created_at,
  );
  assert.equal(changed.history.at(-1).comment, 'Исправить угол');
  assert.equal(lastStatusUpdate(task, []), task.created_at);
});

test('редактирование задачи не меняет её автора, статус и историю', () => {
  const data = createDemo();
  const original = data.tasks[0];
  const edited = saveDemoTask(
    data,
    {
      title: 'Новое название',
      description: 'Описание',
      site_id: original.site_id,
      assignee_id: original.assignee_id,
    },
    data.profiles[0].id,
    original,
  );
  assert.equal(edited.tasks[0].title, 'Новое название');
  assert.equal(edited.tasks[0].status, original.status);
  assert.equal(edited.tasks[0].created_by, original.created_by);
  assert.equal(edited.history, data.history);
  assert.equal(data.tasks[0].title, original.title);
});

test('архивирование объекта убирает его задачи, сохраняя историю и другие объекты', () => {
  const data = createDemo();
  const site = data.sites[0];
  const archived = archiveDemoRecord(data, 'sites', site.id);
  assert.equal(archived.sites.length, 2);
  assert.ok(archived.tasks.every((task) => task.site_id !== site.id));
  assert.equal(archived.history, data.history);
  assert.equal(data.tasks.length, 6);
});
