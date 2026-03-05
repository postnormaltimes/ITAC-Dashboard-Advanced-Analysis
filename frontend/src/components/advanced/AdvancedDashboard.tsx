import React, { useState } from 'react';
import { Box, Stepper, Step, StepLabel, Container, Alert } from '@mui/material';
import Step1_NAICS from './Step1_NAICS';
import Step2_MeasureTable from './Step2_MeasureTable';
import Step3_Distributions from './Step3_Distributions';
import Step4_ClusterDef from './Step4_ClusterDef';
import Step5_Comparison from './Step5_Comparison';
import Step5B_BatAlignment from './Step5B_BatAlignment';
import Step5C_PriorityIndex from './Step5C_PriorityIndex';
import Step6_Selection from './Step6_Selection';
import Step7_BaselineCurve from './Step7_BaselineCurve';
import Step8_NEBInput from './Step8_NEBInput';
import Step9_GapAnalysis from './Step9_GapAnalysis';
import { api } from '../../api/client';
import type { AdvancedMeasure, PriorityMeasure, FirmSizeCategory } from '../../types';

const STEPS = [
    'Industry Selection',    // 0
    'Measure Ranking',       // 1
    'Distributions',         // 2
    'Cluster Definition',    // 3
    'Comparison',            // 4
    'BAT Alignment',         // 5
    'Priority Index',        // 6
    'Selection',             // 7
    'Baseline Curve',        // 8
    'Non-Energy Benefits',   // 9
    'Gap Analysis'           // 10
];

const AdvancedDashboard: React.FC = () => {
    const [activeStep, setActiveStep] = useState(0);

    // State Store — persists across navigation
    const [naicsCode, setNaicsCode] = useState<string>('');
    const [step1Data, setStep1Data] = useState<{ measures: AdvancedMeasure[], industryMedianCost: number, totalAssessments: number } | null>(null);
    const [selectedCategories, setSelectedCategories] = useState<FirmSizeCategory[]>([]);
    const [clusterMeasures, setClusterMeasures] = useState<AdvancedMeasure[]>([]);
    const [selection, setSelection] = useState<string[]>([]);
    const [nebInputs, setNebInputs] = useState<Record<string, { opCost: number, nebValue: number }>>({});
    const [step1Error, setStep1Error] = useState<string | null>(null);

    // Step 5C lifted state — persists when navigating back/forward
    const [currentRankingMode, setCurrentRankingMode] = useState<'criticality' | 'priority'>('priority');
    const [batAdditiveMax, setBatAdditiveMax] = useState(10);
    const [priorityMeasures, setPriorityMeasures] = useState<PriorityMeasure[]>([]);

    const handleStep1Next = async (naics: string) => {
        try {
            setStep1Error(null);
            setNaicsCode(naics);
            setStep1Data(null);

            const data = await api.getAdvancedStep1(naics);
            setStep1Data({ measures: data.measures, industryMedianCost: data.industry_median_energy_cost, totalAssessments: data.total_assessments });
            setActiveStep(1);
        } catch (error: any) {
            console.error("Failed to fetch Step 1 data", error);
            const detail = error?.response?.data?.detail || error?.message || 'Unknown error';
            setStep1Error(`Failed to load data for NAICS "${naics}". Server responded: ${detail}`);
        }
    };

    // Build the measures list for Step 6 based on ranking mode
    const getSelectionMeasures = (): AdvancedMeasure[] => {
        const baseMeasures = clusterMeasures.length ? clusterMeasures : (step1Data?.measures ?? []);

        if (currentRankingMode === 'priority' && priorityMeasures.length > 0) {
            // Build a priority order map: arc → rank (based on priority_score sort from backend)
            const priorityOrder = new Map<string, number>();
            priorityMeasures.forEach((pm, idx) => {
                priorityOrder.set(pm.arc, idx);
            });
            // Sort base measures by priority order; unranked measures go to the end
            return [...baseMeasures].sort((a, b) => {
                const aRank = priorityOrder.get(a.arc) ?? 9999;
                const bRank = priorityOrder.get(b.arc) ?? 9999;
                return aRank - bRank;
            });
        }

        return baseMeasures;
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
                        totalAssessments={step1Data.totalAssessments}
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

                {/* Step 5B — BAT Alignment */}
                {activeStep === 5 && (
                    <Step5B_BatAlignment
                        naicsCode={naicsCode}
                        selectedCategories={selectedCategories}
                        onBack={() => setActiveStep(4)}
                        onNext={() => setActiveStep(6)}
                    />
                )}

                {/* Step 5C — Priority Score (state lifted to dashboard) */}
                {activeStep === 6 && (
                    <Step5C_PriorityIndex
                        naicsCode={naicsCode}
                        selectedCategories={selectedCategories}
                        batAdditiveMax={batAdditiveMax}
                        setBatAdditiveMax={setBatAdditiveMax}
                        rankingMode={currentRankingMode}
                        setRankingMode={setCurrentRankingMode}
                        onPriorityMeasuresLoaded={setPriorityMeasures}
                        onBack={() => setActiveStep(5)}
                        onNext={() => setActiveStep(7)}
                    />
                )}

                {activeStep === 7 && step1Data && (
                    <Step6_Selection
                        measures={getSelectionMeasures()}
                        rankingMode={currentRankingMode}
                        onBack={() => setActiveStep(6)}
                        onNext={(selectedIds) => {
                            setSelection(selectedIds);
                            setActiveStep(8);
                        }}
                    />
                )}

                {activeStep === 8 && (
                    <Step7_BaselineCurve
                        naicsCode={naicsCode}
                        selectedMeasureIds={selection}
                        selectedCategories={selectedCategories}
                        onBack={() => setActiveStep(7)}
                        onNext={() => setActiveStep(9)}
                    />
                )}

                {activeStep === 9 && step1Data && (
                    <Step8_NEBInput
                        naicsCode={naicsCode}
                        measures={clusterMeasures.length ? clusterMeasures : step1Data.measures}
                        selectedMeasureIds={selection}
                        selectedCategories={selectedCategories}
                        nebInputs={nebInputs}
                        setNebInputs={setNebInputs}
                        onBack={() => setActiveStep(8)}
                        onNext={() => setActiveStep(10)}
                    />
                )}

                {activeStep === 10 && (
                    <Step9_GapAnalysis
                        naicsCode={naicsCode}
                        selectedMeasureIds={selection}
                        selectedCategories={selectedCategories}
                        nebInputs={nebInputs}
                        onBack={() => setActiveStep(9)}
                        onReset={() => setActiveStep(0)}
                    />
                )}

            </Box>
        </Container>
    );
};

export default AdvancedDashboard;

