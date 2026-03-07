/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import Step2_MeasureTable from './Step2_MeasureTable';
import { api } from '../../api/client';

vi.mock('../../api/client', () => ({
    api: {
        getMeasureDistributions: vi.fn(),
    }
}));

const baseProps = {
    industryMedianCost: 10,
    naicsCode: '33231',
    onBack: vi.fn(),
    onNext: vi.fn(),
};

describe('Step2_MeasureTable CCE consistency', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('displays backend-resolved fallback NAICS annotation for CCE', async () => {
        const measures = [
            {
                arc: 'M1', description: 'Measure 1', count: 10, imp_rate: 0.5,
                gross_savings: 100, payback: 2, cce_primary: 5, cce: 5, score: 80,
                cce_scope_used: 'prefix', cce_naics_prefix_used: '332', cce_valid_count: 5,
            },
        ];

        (api.getMeasureDistributions as any).mockResolvedValue({
            gross_savings: [1, 2, 3],
            payback: [1, 2, 3],
            cce_primary: [4, 5, 6, 7, 8],
            count: 5,
            scope_used: 'prefix',
            naics_prefix_used: '332',
            valid_count: 5,
        });

        render(<Step2_MeasureTable measures={measures as any} {...baseProps} />);

        await waitFor(() => {
            expect(api.getMeasureDistributions).toHaveBeenCalledWith('33231', 'M1');
        });

        expect(screen.getByText('Payback — M1')).toBeInTheDocument();
        expect(screen.getByText('CCE ($/GJ) — M1 (fallback: NAICS 332)')).toBeInTheDocument();
    });

    it('renders N/A for null CCE in table cell', async () => {
        const measures = [
            {
                arc: 'M1', description: 'Measure 1', count: 10, imp_rate: 0.5,
                gross_savings: 100, payback: 2, cce_primary: null, cce: null, score: 80,
                cce_scope_used: 'none', cce_naics_prefix_used: null, cce_valid_count: 0,
            },
        ];

        (api.getMeasureDistributions as any).mockResolvedValue({
            gross_savings: [1],
            payback: [1],
            cce_primary: [],
            count: 1,
            scope_used: 'none',
            naics_prefix_used: null,
            valid_count: 0,
        });

        render(<Step2_MeasureTable measures={measures as any} {...baseProps} />);

        expect(await screen.findByText('N/A')).toBeInTheDocument();
    });
});
