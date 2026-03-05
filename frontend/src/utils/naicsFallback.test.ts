import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveNaicsScopeForMeasureCCE, normalizeNaics } from './naicsFallback';
import { api } from '../api/client';
import type { MeasureDistributionResponse } from '../types';

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
    it('strips non-digits from NAICS', () => {
        expect(normalizeNaics('32-221')).toBe('32221');
        expect(normalizeNaics('3323A')).toBe('3323');
    });
});

describe('resolveNaicsScopeForMeasureCCE', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns exact scope when exact NAICS has any valid CCE sample', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce(mockDistResponse(2));

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'EXACT-ANY-NONZERO',
            minValidN: 5,
        });

        expect(mockApi).toHaveBeenCalledTimes(1);
        expect(mockApi).toHaveBeenCalledWith('32221', 'EXACT-ANY-NONZERO', undefined);
        expect(result.scope).toBe('exact');
        expect(result.usedNaicsPrefix).toBe('32221');
        expect(result.reason).toBe('insufficient_data');
        expect(result.validCount).toBe(2);
    });

    it('falls back to first broader prefix with non-zero CCE (no min-N gating)', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce(mockDistResponse(0)); // 32221
        mockApi.mockResolvedValueOnce(mockDistResponse(3)); // 3222

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'FIRST-PREFIX-NONZERO',
            minValidN: 5,
        });

        expect(mockApi).toHaveBeenCalledTimes(2);
        expect(mockApi).toHaveBeenNthCalledWith(1, '32221', 'FIRST-PREFIX-NONZERO', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '3222', 'FIRST-PREFIX-NONZERO', undefined);

        expect(result.scope).toBe('prefix');
        expect(result.usedNaicsPrefix).toBe('3222');
        expect(result.reason).toBe('insufficient_data');
        expect(result.validCount).toBe(3);
    });

    it('stops truncation at minNaicsDigits (3) and then falls back to all', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce(mockDistResponse(0)); // 32221
        mockApi.mockResolvedValueOnce(mockDistResponse(0)); // 3222
        mockApi.mockResolvedValueOnce(mockDistResponse(0)); // 322
        mockApi.mockResolvedValueOnce(mockDistResponse(9)); // all

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32221',
            arcCode: 'ALL-AFTER-3DIGIT',
            minNaicsDigits: 3,
            minValidN: 5,
        });

        expect(mockApi).toHaveBeenCalledTimes(4);
        expect(mockApi).toHaveBeenNthCalledWith(1, '32221', 'ALL-AFTER-3DIGIT', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '3222', 'ALL-AFTER-3DIGIT', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(3, '322', 'ALL-AFTER-3DIGIT', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(4, '', 'ALL-AFTER-3DIGIT', undefined);

        expect(result.scope).toBe('all');
        expect(result.usedNaicsPrefix).toBeNull();
        expect(result.reason).toBe('ok');
        expect(result.validCount).toBe(9);
    });

    it('normalizes NAICS input before prefix iteration', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValueOnce(mockDistResponse(0)); // 32221
        mockApi.mockResolvedValueOnce(mockDistResponse(2)); // 3222

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '32-221',
            arcCode: 'NORMALIZED',
        });

        expect(mockApi).toHaveBeenNthCalledWith(1, '32221', 'NORMALIZED', undefined);
        expect(mockApi).toHaveBeenNthCalledWith(2, '3222', 'NORMALIZED', undefined);
        expect(result.usedNaicsPrefix).toBe('3222');
    });

    it('returns no_data_found when nothing is valid, including all-industries', async () => {
        const mockApi = api.getMeasureDistributions as any;
        mockApi.mockResolvedValue(mockDistResponse(0));

        const result = await resolveNaicsScopeForMeasureCCE({
            selectedNaics: '3323',
            arcCode: 'NO-DATA',
            minNaicsDigits: 3,
        });

        expect(result.scope).toBe('all');
        expect(result.reason).toBe('no_data_found');
        expect(result.validCount).toBe(0);
    });
});
