import { describe, it, expect } from 'vitest';
import { normalizeWeights, computeStats, buildSupplyCurveSteps } from './stats';

describe('normalizeWeights', () => {
    it('should normalize weights to sum to 100 with last item balancing', () => {
        const result = normalizeWeights([30, 50, 20], 1);
        expect(result).toEqual([30, 50, 20]);
    });
    it('should clamp the edited weight if sum exceeds 100', () => {
        const result = normalizeWeights([30, 100, 40], 1);
        expect(result).toEqual([30, 70, 0]);
    });
    it('should force changed weight into [0, 100] bounds or clamp it', () => {
        const result = normalizeWeights([33, 33, 150], 2);
        // last item tries to be 150 -> clamped to 100
        // remainder = 100 - 100 - 33 = -33 -> clamps last item to 67
        expect(result).toEqual([0, 33, 67]);

        const result2 = normalizeWeights([-10, 33, 34], 0);
        expect(result2).toEqual([0, 33, 67]);
    });
});

describe('computeStats', () => {
    it('should compute correct summary statistics', () => {
        const data = [1, 2, 3, 4, 5];
        const stats = computeStats(data);
        expect(stats.min).toBe(1);
        expect(stats.max).toBe(5);
        expect(stats.median).toBe(3);
        expect(stats.q1).toBe(2);
        expect(stats.q3).toBe(4);
    });
    it('should handle empty arrays', () => {
        const stats = computeStats([]);
        expect(stats.min).toBe(0);
        expect(stats.max).toBe(0);
        expect(stats.median).toBe(0);
    });
});

describe('buildSupplyCurveSteps', () => {
    it('should build staircase structure from curve points', () => {
        const input = [
            { cce: 10, savings: 100, label: 'A', units: 'MWh' },
            { cce: 20, savings: 50, label: 'B', units: 'MWh' }
        ];
        const res = buildSupplyCurveSteps(input);

        // Two points per input, so total 4 points
        expect(res.length).toBe(4);

        // Level 1: A
        expect(res[0].x).toBe(0);
        expect(res[0].y).toBe(10);
        expect(res[0].isEdge).toBe(true);

        expect(res[1].x).toBe(100);
        expect(res[1].y).toBe(10);
        expect(res[1].isEdge).toBe(false);

        // Level 2: B
        expect(res[2].x).toBe(100); // starts exactly at previous cumulative X
        expect(res[2].y).toBe(20); // with new Y
        expect(res[2].isEdge).toBe(true);

        expect(res[3].x).toBe(150);
        expect(res[3].y).toBe(20);
        expect(res[3].isEdge).toBe(false);
    });
});
