
import React, { useState, useEffect } from 'react';
import { Grid, Box, Typography, Tabs, Tab } from '@mui/material';
import type { SearchFilters, CostCurveParams, CostCurveResponse } from '../types';
import { api } from '../api/client';
import CostCurveChart from './CostCurveChart';
import CostCurveSensitivity from './CostCurveSensitivity';

interface CostCurvesProps {
    filters: SearchFilters;
}

const CostCurves: React.FC<CostCurvesProps> = ({ filters }) => {
    const [params, setParams] = useState<CostCurveParams>({
        discount_rate: 0.07,
        lifetime: 15,
        energy_price: 0.10,
        include_program_costs: false,
        program_cost_adder: 0.20,
        transaction_cost_adder: 0.0
    });

    const [data, setData] = useState<CostCurveResponse | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [tabIndex, setTabIndex] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const result = await api.getCostCurves(filters, params);
                setData(result);
            } catch (error) {
                console.error("Failed to fetch cost curves", error);
            } finally {
                setIsLoading(false);
            }
        };

        // Debounce fetching if needed, but for now direct call
        fetchData();
    }, [filters, params]);

    const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
        setTabIndex(newValue);
    };

    return (
        <Grid container spacing={2} sx={{ height: 'calc(100vh - 100px)' }}>
            <Grid size={{ xs: 12, md: 9, lg: 9 }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                    <Tabs value={tabIndex} onChange={handleTabChange}>
                        {/* We merge Sub-tabs 1, 2, 3 into one Chart view for simplicity as they are layers */}
                        <Tab label="Supply-Demand Curve" />
                        {/* Placeholder for other views if needed */}
                        {/* <Tab label="Supply Benchmarks" /> */}
                    </Tabs>
                </Box>

                {tabIndex === 0 && (
                    <CostCurveChart data={data} isLoading={isLoading} />
                )}

                {data && data.stats && (
                    <Box sx={{ mt: 2, p: 2, display: 'flex', gap: 4 }}>
                        <Box>
                            <Typography variant="caption" color="textSecondary">Technical Potential</Typography>
                            <Typography variant="h6">{data.stats.technical_potential_mwh?.toLocaleString(undefined, { maximumFractionDigits: 0 })} MWh</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="textSecondary">Economic Potential</Typography>
                            <Typography variant="h6" color="primary">{data.stats.economic_potential_mwh?.toLocaleString(undefined, { maximumFractionDigits: 0 })} MWh</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="textSecondary">Market Potential</Typography>
                            <Typography variant="h6" color="secondary">{data.stats.market_potential_mwh?.toLocaleString(undefined, { maximumFractionDigits: 0 })} MWh</Typography>
                        </Box>
                    </Box>
                )}

            </Grid>
            <Grid size={{ xs: 12, md: 3, lg: 3 }}>
                <CostCurveSensitivity params={params} onChange={setParams} />
            </Grid>
        </Grid>
    );
};

export default CostCurves;
