import { test, expect } from '../../src/fixtures';
import { JsonPlaceholderPosts } from '../pom';

test.describe('REST API - CRUD Operations', () => {
  test('GET /posts - fetches list of posts', async ({ api }) => {
    const posts = new JsonPlaceholderPosts(api);
    const res = await posts.list();

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /posts/1 - fetches single post', async ({ api }) => {
    const posts = new JsonPlaceholderPosts(api);
    const res = await posts.getById(1);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.title).toBeTruthy();
  });

  test('POST /posts - creates a new post', async ({ api }) => {
    const posts = new JsonPlaceholderPosts(api);
    const res = await posts.create({
      title: 'Automation Framework Test',
      body: 'Testing POST endpoint',
      userId: 1,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe('Automation Framework Test');
  });

  test('PUT /posts/1 - updates a post', async ({ api }) => {
    const posts = new JsonPlaceholderPosts(api);
    const res = await posts.update(1, {
      id: 1,
      title: 'Updated Title',
      body: 'Updated body content',
      userId: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
  });

  test('DELETE /posts/1 - deletes a post', async ({ api }) => {
    const posts = new JsonPlaceholderPosts(api);
    const res = await posts.remove(1);

    expect(res.status).toBe(200);
  });
});
