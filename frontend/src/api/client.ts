
import axios from 'axios';
import type { SearchFilters, SearchResponse, Recommendation, RecommendationDetail, IFacetsResponse, CostCurveParams, CostCurveResponse, WaterfallResponse, KPIMetrics, AnalyticsChartsResponse, SensitivityParams, SensitivityResponse, Step0Response, Step1Response, Step2Response, Step3Response, AdvancedStep1Response, AdvancedStep2Response, AdvancedStep3Response, AdvancedStep4Response, MeasureDistributionResponse, PrimaryCurveResponse, NEBDetailsResponse, FirmSizeCategory } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const api = {
    search: async (filters: SearchFilters, page = 1, size = 20): Promise<SearchResponse> => {
        const response = await client.post<SearchResponse>('/search', filters, {
            params: { page, size }
        });
        return response.data;
    },

    getFacets: async (filters: SearchFilters): Promise<IFacetsResponse> => {
        const response = await client.post<IFacetsResponse>('/facets', filters);
        return response.data;
    },

    getRecommendation: async (id: string): Promise<Recommendation> => {
        const response = await client.get<Recommendation>(`/recommendation/${id}`);
        return response.data;
    },

    getCostCurves: async (filters: SearchFilters, params: CostCurveParams): Promise<CostCurveResponse> => {
        const response = await client.post<CostCurveResponse>('/cost_curves/compute', { filters, params });
        return response.data;
    },

    getWaterfallAnalysis: async (filters: SearchFilters): Promise<WaterfallResponse> => {
        const response = await fetch(`${API_URL}/waterfall/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters),
        });
        return response.json();
    },

    getKPIs: async (filters: SearchFilters): Promise<KPIMetrics> => {
        const response = await fetch(`${API_URL}/analytics/kpi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters),
        });
        return response.json();
    },

    getCharts: async (filters: SearchFilters): Promise<AnalyticsChartsResponse> => {
        const response = await fetch(`${API_URL}/analytics/charts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters),
        });
        return response.json();
    },

    getRecommendationDetail: async (id: string): Promise<RecommendationDetail> => {
        const response = await fetch(`${API_URL}/recommendation/${id}`);
        if (!response.ok) throw new Error('Failed to fetch recommendation detail');
        return response.json();
    },

    exportCSV: async (filters: SearchFilters): Promise<void> => {
        const response = await fetch(`${API_URL}/export/csv`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters),
        });
        if (!response.ok) throw new Error('Export failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `itac_recommendations_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    getSensitivity: async (filters: SearchFilters, params: SensitivityParams): Promise<SensitivityResponse> => {
        const response = await client.post<SensitivityResponse>('/sensitivity/compute', { filters, scenario_params: params });
        return response.data;
    },

    // --- Shadow Dashboard ---
    getStep0: async (metric: 'count' | 'energy', limit: number = 25): Promise<Step0Response> => {
        const response = await client.get<Step0Response>('/shadow/step0', { params: { metric, limit } });
        return response.data;
    },

    getStep1: async (pivot_type: 'naics' | 'arc', pivot_id: string): Promise<Step1Response> => {
        const response = await client.get<Step1Response>('/shadow/step1', { params: { pivot_type, pivot_id } });
        return response.data;
    },

    getStep2: async (naics_code: string, arc_code: string): Promise<Step2Response> => {
        const response = await client.get<Step2Response>('/shadow/step2', { params: { naics_code, arc_code } });
        return response.data;
    },

    getStep3: async (naics_code: string, arc_code: string, firm_size: string): Promise<Step3Response> => {
        const response = await client.get<Step3Response>('/shadow/step3', { params: { naics_code, arc_code, firm_size } });
        return response.data;
    },

    // --- Advanced Dashboard (9-Step) ---
    getAdvancedStep1: async (naics_code: string): Promise<AdvancedStep1Response> => {
        const response = await client.post<AdvancedStep1Response>('/advanced/step1_evaluate', { naics_code });
        return response.data;
    },

    getAdvancedStep2: async (naics_code: string, measure_ids: string[]): Promise<AdvancedStep2Response> => {
        const response = await client.post<AdvancedStep2Response>('/advanced/step2_distributions', { naics_code, measure_ids });
        return response.data;
    },

    getAdvancedStep3: async (
        naics_code: string,
        min_employees: number, max_employees: number,
        min_sales: number, max_sales: number,
        categories?: FirmSizeCategory[],
    ): Promise<AdvancedStep3Response> => {
        const response = await client.post<AdvancedStep3Response>('/advanced/step3_filtered_evaluate', {
            naics_code, min_employees, max_employees, min_sales, max_sales, categories
        });
        return response.data;
    },

    getAdvancedStep4: async (naics_code: string, selected_measure_ids: string[], resource_type: string = 'all'): Promise<AdvancedStep4Response> => {
        const response = await client.post<AdvancedStep4Response>('/advanced/step4_curves', {
            naics_code, selected_measure_ids, resource_type
        });
        return response.data;
    },

    // --- NEW: Per-measure distributions ---
    getMeasureDistributions: async (
        naics_code: string, arc_code: string, categories?: FirmSizeCategory[]
    ): Promise<MeasureDistributionResponse> => {
        const response = await client.post<MeasureDistributionResponse>('/advanced/step2_measure_distributions', {
            naics_code, arc_code, categories
        });
        return response.data;
    },

    // --- NEW: Primary energy curves ---
    getPrimaryCurves: async (
        naics_code: string,
        selected_measure_ids: string[],
        electricity_price_mwh?: number,
        gas_price_mmbtu?: number,
        categories?: FirmSizeCategory[],
    ): Promise<PrimaryCurveResponse> => {
        const response = await client.post<PrimaryCurveResponse>('/advanced/step4_curves', {
            naics_code, selected_measure_ids,
            electricity_price_mwh: electricity_price_mwh ?? 70.0,
            gas_price_mmbtu: gas_price_mmbtu ?? 5.0,
            categories,
        });
        return response.data;
    },

    // --- NEW: NEB Details ---
    getNEBDetails: async (
        naics_code: string, selected_measure_ids: string[], categories?: FirmSizeCategory[]
    ): Promise<NEBDetailsResponse> => {
        const response = await client.post<NEBDetailsResponse>('/advanced/step8_neb_details', {
            naics_code, selected_measure_ids, categories
        });
        return response.data;
    },
};
