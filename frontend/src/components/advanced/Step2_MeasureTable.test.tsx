/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import Step2_MeasureTable from './Step2_MeasureTable';
import { api } from '../../api/client';
import { resolveNaicsScopeForMeasureCCE } from '../../utils/naicsFallback';

// Mock dependencies
vi.mock('../../api/client', () => ({
    api: {
        getMeasureDistributions: vi.fn(),
    }
}));

vi.mock('../../utils/naicsFallback', () => ({
    resolveNaicsScopeForMeasureCCE: vi.fn(),
}));

const mockMeasures = [
    { arc: 'M1', description: 'Measure 1', count: 10, imp_rate: 0.5, gross_savings: 100, payback: 2, cce_primary: 5, cce: 5, score: 80 }
];

describe('Step2_MeasureTable NAICS Fallback Integration', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('displays fallback NAICS annotation for CCE but NOT for Payback', async () => {
        // Mock exact distributions for GS/Payback
        (api.getMeasureDistributions as any).mockResolvedValue({
            gross_savings: [1, 2, 3],
            payback: [1, 2, 3],
            cce_primary: [], // Exact NAICS has no CCE data
            count: 3
        });

        // Mock fallback resolving for CCE
        (resolveNaicsScopeForMeasureCCE as any).mockResolvedValue({
            scope: 'prefix',
            usedNaicsPrefix: '332',
            validCount: 5,
            reason: 'insufficient_data',
            distributions: {
                gross_savings: [],
                payback: [],
                cce_primary: [4, 5, 6, 7, 8],
                count: 5
            }
        });

        render(
            <Step2_MeasureTable
                measures={mockMeasures}
                industryMedianCost={10}
                naicsCode="33231"
                totalAssessments={100}
                onBack={vi.fn()}
                onNext={vi.fn()}
            />
        );

        // Wait for data to load
        await waitFor(() => {
            expect(api.getMeasureDistributions).toHaveBeenCalledWith('33231', 'M1');
            expect(resolveNaicsScopeForMeasureCCE).toHaveBeenCalledWith({ selectedNaics: '33231', arcCode: 'M1' });
        });

        // The labels for GS/Payback should NOT contain fallback text
        expect(screen.getByText('Payback — M1')).toBeInTheDocument();

        // The label for CCE SHOULD contain fallback text
        expect(screen.getByText('CCE ($/GJ) — M1 (fallback: NAICS 332)')).toBeInTheDocument();
    });
});
