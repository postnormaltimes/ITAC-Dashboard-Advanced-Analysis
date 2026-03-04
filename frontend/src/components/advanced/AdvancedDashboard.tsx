import React, { useState } from 'react';
import { Box, Stepper, Step, StepLabel, Container, Alert } from '@mui/material';
import Step1_NAICS from './Step1_NAICS';
import Step2_MeasureTable from './Step2_MeasureTable';
import Step3_Distributions from './Step3_Distributions';
import Step4_ClusterDef from './Step4_ClusterDef';
import Step5_Comparison from './Step5_Comparison';
import Step6_Selection from './Step6_Selection';
import Step7_BaselineCurve from './Step7_BaselineCurve';
import Step8_NEBInput from './Step8_NEBInput';
import Step9_GapAnalysis from './Step9_GapAnalysis';
import { api } from '../../api/client';
import type { AdvancedMeasure, FirmSizeCategory } from '../../types';

const STEPS = [
    'Industry Selection',
    'Measure Ranking',
    'Distributions',
    'Cluster Definition',
    'Comparison',
    'Selection',
    'Baseline Curve',
    'Non-Energy Benefits',
    'Gap Analysis'
];

const AdvancedDashboard: React.FC = () => {
    const [activeStep, setActiveStep] = useState(0);

    // State Store
    const [naicsCode, setNaicsCode] = useState<string>('');
    const [step1Data, setStep1Data] = useState<{ measures: AdvancedMeasure[], industryMedianCost: number } | null>(null);
    const [selectedCategories, setSelectedCategories] = useState<FirmSizeCategory[]>([]);
    const [clusterMeasures, setClusterMeasures] = useState<AdvancedMeasure[]>([]);
    const [selection, setSelection] = useState<string[]>([]);
    const [nebInputs, setNebInputs] = useState<Record<string, { opCost: number, nebValue: number }>>({});
    const [step1Error, setStep1Error] = useState<string | null>(null);

    const handleStep1Next = async (naics: string) => {
        try {
            setStep1Error(null);
            setNaicsCode(naics);
            setStep1Data(null);

            const data = await api.getAdvancedStep1(naics);
            setStep1Data({ measures: data.measures, industryMedianCost: data.industry_median_energy_cost });
            setActiveStep(1);
        } catch (error: any) {
            console.error("Failed to fetch Step 1 data", error);
            const detail = error?.response?.data?.detail || error?.message || 'Unknown error';
            setStep1Error(`Failed to load data for NAICS "${naics}". Server responded: ${detail}`);
        }
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
                {STEPS.map((label) => (
                    <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                    </Step>
                ))}
            </Stepper>

            <Box>
                {activeStep === 0 && (
                    <>
                        {step1Error && (
                            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setStep1Error(null)}>
                                {step1Error}
                            </Alert>
                        )}
                        <Step1_NAICS onNext={handleStep1Next} />
                    </>
                )}

                {activeStep === 1 && step1Data && (
                    <Step2_MeasureTable
                        measures={step1Data.measures}
                        industryMedianCost={step1Data.industryMedianCost}
                        naicsCode={naicsCode}
                        onBack={() => setActiveStep(0)}
                        onNext={() => setActiveStep(2)}
                    />
                )}

                {activeStep === 2 && step1Data && (
                    <Step3_Distributions
                        naicsCode={naicsCode}
                        measures={step1Data.measures}
                        onBack={() => setActiveStep(1)}
                        onNext={() => setActiveStep(3)}
                    />
                )}

                {activeStep === 3 && (
                    <Step4_ClusterDef
                        onBack={() => setActiveStep(2)}
                        onNext={(categories) => {
                            setSelectedCategories(categories);
                            setActiveStep(4);
                        }}
                    />
                )}

                {activeStep === 4 && step1Data && (
                    <Step5_Comparison
                        naicsCode={naicsCode}
                        genericMeasures={step1Data.measures}
                        selectedCategories={selectedCategories}
                        onBack={() => setActiveStep(3)}
                        onNext={(measures) => {
                            setClusterMeasures(measures);
                            setActiveStep(5);
                        }}
                    />
                )}

                {activeStep === 5 && step1Data && (
                    <Step6_Selection
                        measures={clusterMeasures.length ? clusterMeasures : step1Data.measures}
                        onBack={() => setActiveStep(4)}
                        onNext={(selectedIds) => {
                            setSelection(selectedIds);
                            setActiveStep(6);
                        }}
                    />
                )}

                {activeStep === 6 && (
                    <Step7_BaselineCurve
                        naicsCode={naicsCode}
                        selectedMeasureIds={selection}
                        selectedCategories={selectedCategories}
                        onBack={() => setActiveStep(5)}
                        onNext={() => setActiveStep(7)}
                    />
                )}

                {activeStep === 7 && step1Data && (
                    <Step8_NEBInput
                        naicsCode={naicsCode}
                        measures={clusterMeasures.length ? clusterMeasures : step1Data.measures}
                        selectedMeasureIds={selection}
                        selectedCategories={selectedCategories}
                        nebInputs={nebInputs}
                        setNebInputs={setNebInputs}
                        onBack={() => setActiveStep(6)}
                        onNext={() => setActiveStep(8)}
                    />
                )}

                {activeStep === 8 && (
                    <Step9_GapAnalysis
                        naicsCode={naicsCode}
                        selectedMeasureIds={selection}
                        selectedCategories={selectedCategories}
                        nebInputs={nebInputs}
                        onBack={() => setActiveStep(7)}
                        onReset={() => setActiveStep(0)}
                    />
                )}

            </Box>
        </Container>
    );
};

export default AdvancedDashboard;
