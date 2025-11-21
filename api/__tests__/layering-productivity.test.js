const request = require('supertest');
const app = require('../server');

describe('Layering Productivity API', () => {
  const authToken = 'test-token';

  describe('GET /api/productivity/layering', () => {
    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/api/productivity/layering');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should return array with auth token', async () => {
      const response = await request(app)
        .get('/api/productivity/layering')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should validate date parameters', async () => {
      const response = await request(app)
        .get('/api/productivity/layering?from=invalid-date')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid from date');
    });

    it('should accept valid query parameters', async () => {
      const response = await request(app)
        .get('/api/productivity/layering?from=2024-01-01&to=2024-01-02&team=test&limit=50')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
    });

    it('should set no-cache headers', async () => {
      const response = await request(app)
        .get('/api/productivity/layering')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.headers['cache-control']).toContain('no-store');
    });
  });

  describe('GET /api/productivity/layering/stream', () => {
    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/api/productivity/layering/stream');
      
      expect(response.status).toBe(401);
    });

    it('should return SSE headers with auth token', async () => {
      const response = await request(app)
        .get('/api/productivity/layering/stream')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
    });
  });

  describe('Data Schema Validation', () => {
    it('should return correct data structure', async () => {
      const response = await request(app)
        .get('/api/productivity/layering')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      
      if (response.body.length > 0) {
        const item = response.body[0];
        expect(item).toHaveProperty('user_id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('layering_percent');
        expect(item).toHaveProperty('layering_seconds');
        expect(item).toHaveProperty('jobs_count');
        expect(item).toHaveProperty('last_updated');
        
        expect(typeof item.layering_percent).toBe('number');
        expect(item.layering_percent).toBeGreaterThanOrEqual(0);
        expect(item.layering_percent).toBeLessThanOrEqual(100);
      }
    });

    it('should sort by layering_percent descending', async () => {
      const response = await request(app)
        .get('/api/productivity/layering')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      
      if (response.body.length > 1) {
        for (let i = 1; i < response.body.length; i++) {
          expect(response.body[i-1].layering_percent).toBeGreaterThanOrEqual(
            response.body[i].layering_percent
          );
        }
      }
    });
  });
});