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
    { arc: 'M1', description: 'Measure 1', count: 10, imp_rate: 0.5, gross_savings: 100, payback: 2, cce_primary: 5, cce: 5, score: 80 },
    { arc: 'M2', description: 'Measure 2 nulls', count: 5, imp_rate: 0.0, gross_savings: null, payback: null, cce_primary: null, cce: null, score: 0 }
];

describe('Step2_MeasureTable UI logic', () => {
    beforeEach(() => {
        vi.resetAllMocks();

        // Mock default distributions to prevent hangs
        (api.getMeasureDistributions as any).mockResolvedValue({
            gross_savings: [], payback: [], cce_primary: [], count: 0
        });
        (resolveNaicsScopeForMeasureCCE as any).mockResolvedValue({
            scope: 'exact', usedNaicsPrefix: '123', validCount: 0, reason: 'insufficient_data', distributions: { gross_savings: [], payback: [], cce_primary: [], count: 0 }
        });
    });

    it('displays fallback NAICS annotation for CCE but NOT for Payback', async () => {
        (resolveNaicsScopeForMeasureCCE as any).mockResolvedValue({
            scope: 'prefix',
            usedNaicsPrefix: '332',
            validCount: 5,
            reason: 'insufficient_data',
            distributions: { gross_savings: [], payback: [], cce_primary: [4, 5, 6, 7, 8], count: 5 }
        });

        render(<Step2_MeasureTable measures={mockMeasures} industryMedianCost={10} naicsCode="33231" totalAssessments={100} onBack={vi.fn()} onNext={vi.fn()} />);

        await waitFor(() => expect(api.getMeasureDistributions).toHaveBeenCalled());
        expect(screen.getByText('Payback — M1')).toBeInTheDocument();
        expect(screen.getByText('CCE ($/GJ) — M1 (fallback: NAICS 332)')).toBeInTheDocument();
    });

    it('calculates Rec Rate accurately and handles 0 denominator', () => {
        const { rerender } = render(<Step2_MeasureTable measures={mockMeasures} industryMedianCost={10} naicsCode="33231" totalAssessments={100} onBack={vi.fn()} onNext={vi.fn()} />);

        // row.count (10) / totalAssessments (100) * 100 = 10.0%
        // there might be multiple '10.0%' e.g. from implementation rate or other columns
        expect(screen.getAllByText('10.0%').length).toBeGreaterThan(0);
        // M2 
        expect(screen.getAllByText('5.0%').length).toBeGreaterThan(0);

        // Re-render with 0 assessments -> Should display N/A for those columns
        rerender(<Step2_MeasureTable measures={mockMeasures} industryMedianCost={10} naicsCode="33231" totalAssessments={0} onBack={vi.fn()} onNext={vi.fn()} />);
        expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
    });

    it('renders N/A instead of $0.00 for null values', () => {
        render(<Step2_MeasureTable measures={mockMeasures} industryMedianCost={10} naicsCode="33231" totalAssessments={100} onBack={vi.fn()} onNext={vi.fn()} />);

        // M1 has valid $5
        expect(screen.getAllByText('$5.00/GJ').length).toBeGreaterThan(0);

        // M2 has nulls, so "N/A" must appear in the table cells for GS, Payback, CCE
        const naCells = screen.getAllByText('N/A');
        // Expect at least 3 N/As from the M2 (GS, PB, CCE)
        expect(naCells.length).toBeGreaterThanOrEqual(3);
    });
});
