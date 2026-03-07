import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveNaicsScopeForMeasureCCE, normalizeNaics } from './naicsFallback';
import type { MeasureDistributionResponse } from '../types';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
    api: {
        getMeasureDistributions: vi.fn(),
    },
}));

const mockDistResponse = (cceCount: number): MeasureDistributionResponse => ({
    gross_savings: [],
    payback: [],
    cce_primary: Array(cceCount).fill(1.5),
    count: Math.max(cceCount, 10),
});

describe('normalizeNaics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('strips non-digits from NAICS', () => {
        expect(normalizeNaics('32-221')).toBe('32221');
        expect(normalizeNaics('3323A')).toBe('3323');
    });

    it('should normalize NAICS correctly', () => {
        expect(normalizeNaics('32221 ')).toBe('32221');
        expect(normalizeNaics('322-21')).toBe('32221');
        expect(normalizeNaics('A32221')).toBe('32221');
    });

    it('returns exact scope if backend returns exact', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce({
            ...mockDistResponse(6),
            scope_used: 'exact',
            naics_prefix_used: '32221',
            valid_count: 6
        });

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'EXACT-MATCH'
        });

        expect(result.scope).toBe('exact');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(6);
        expect(api.getMeasureDistributions).toHaveBeenCalledTimes(1);
    });

    it('returns prefix scope if backend broadened it', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce({
            ...mockDistResponse(5),
            scope_used: 'prefix',
            naics_prefix_used: '322',
            valid_count: 5
        });

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'BROADEN-FOR-STABILITY'
        });

        expect(mockApi).toHaveBeenCalledTimes(1);
        expect(result.scope).toBe('prefix');
        expect(result.usedNaicsPrefix).toBe('322');
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(5);
    });

    it('identifies insufficient_data when validCount < minValidN but > 0', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce({
            ...mockDistResponse(4),
            scope_used: 'exact',
            naics_prefix_used: '32221',
            valid_count: 4
        });

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'INSUFFICIENT' // defaults to minValidN=5
        });

        expect(result.reason).toBe('insufficient_data');
        expect(result.validCount).toBe(4);
    });

    it('returns no_data_found when all scopes are empty', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValue({
            ...mockDistResponse(0),
            scope_used: 'all',
            naics_prefix_used: null,
            valid_count: 0
        });

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '3323',
            arcCode: 'NO-DATA'
        });

        expect(result.scope).toBe('all');
        expect(result.reason).toBe('no_data_found');
        expect(result.validCount).toBe(0);
    });
});
