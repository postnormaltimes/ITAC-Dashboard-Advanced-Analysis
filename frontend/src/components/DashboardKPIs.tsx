
import React, { useEffect, useState } from 'react';
import { Grid, Paper, Typography, Box, CircularProgress } from '@mui/material';
import type { SearchFilters, KPIMetrics } from '../types';
import { api } from '../api/client';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

interface DashboardKPIsProps {
    filters: SearchFilters;
}

const DashboardKPIs: React.FC<DashboardKPIsProps> = ({ filters }) => {
    const [kpis, setKpis] = useState<KPIMetrics | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchKPIs = async () => {
            setLoading(true);
            try {
                const data = await api.getKPIs(filters);
                setKpis(data);
            } catch (error) {
                console.error("Failed to fetch KPIs", error);
            } finally {
                setLoading(false);
            }
        };

        fetchKPIs();
    }, [filters]);

    const formatCurrency = (val: number) => {
        if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
        return `$${val.toFixed(0)}`;
    };

    if (loading) {
        return (
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {[1, 2, 3, 4].map((i) => (
                    <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                        <Paper sx={{ p: 2, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CircularProgress size={24} />
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        );
    }

    if (!kpis) return null;

    return (
        <Grid container spacing={2} sx={{ mb: 3 }}>
            <KPIItem
                title="Total Savings Identified"
                value={formatCurrency(kpis.total_savings)}
                subtitle={`${kpis.count} Opportunities`}
                icon={<AttachMoneyIcon color="primary" fontSize="large" />}
            />
            <KPIItem
                title="Avg Payback Period"
                value={`${kpis.avg_payback.toFixed(1)} Years`}
                subtitle="Weighted Average"
                icon={<TimelapseIcon color="action" fontSize="large" />}
            />
            <KPIItem
                title="Implemented Savings"
                value={formatCurrency(kpis.implemented_savings)}
                subtitle={`${kpis.percent_implemented.toFixed(1)}% Conversion Rate`}
                icon={<CheckCircleIcon color="success" fontSize="large" />}
            />
            <KPIItem
                title="Top Opportunity"
                value={kpis.top_arc || "N/A"}
                subtitle="By Total Savings"
                icon={<TrendingUpIcon color="secondary" fontSize="large" />}
            />
        </Grid>
    );
};

const KPIItem = ({ title, value, subtitle, icon }: { title: string, value: string, subtitle: string, icon: React.ReactNode }) => (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%' }}>
            <Box>
                <Typography variant="caption" color="textSecondary" display="block" gutterBottom>
                    {title}
                </Typography>
                <Typography variant="h5" fontWeight="bold">
                    {value}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                    {subtitle}
                </Typography>
            </Box>
            <Box sx={{ opacity: 0.8 }}>
                {icon}
            </Box>
        </Paper>
    </Grid>
);

export default DashboardKPIs;
