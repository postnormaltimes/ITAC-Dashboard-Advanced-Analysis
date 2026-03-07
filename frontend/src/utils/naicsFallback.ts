import { api } from '../api/client';
import type { FirmSizeCategory, MeasureDistributionResponse } from '../types';

export interface ResolverResult {
    scope: 'exact' | 'prefix' | 'all';
    usedNaicsPrefix: string | null;
    validCount: number;
    reason: 'ok' | 'insufficient_data' | 'no_data_found';
    distributions: MeasureDistributionResponse | null;
}

const resolverCache = new Map<string, ResolverResult>();

export function normalizeNaics(naics: string): string {
    return naics.replace(/\D/g, '');
}

/**
 * Resolve NAICS scope for Step-2 CCE:
 * 1) exact -> broader prefixes down to minNaicsDigits
 * 2) return first prefix meeting minValidN
 * 3) if none meet minValidN but some have >0, use the largest sample (most specific on ties)
 * 4) if all prefixes have 0, fallback to all industries
 */
export async function resolveNaicsScopeForMeasureCCE({
    selectedNaics,
    arcCode,
    categories,
    minNaicsDigits = 3,
    minValidN = 5,
}: {
    selectedNaics: string;
    arcCode: string;
    categories?: FirmSizeCategory[];
    minNaicsDigits?: number;
    minValidN?: number;
}): Promise<ResolverResult> {
    const naicsDigits = normalizeNaics(selectedNaics);
    const catKey = categories ? categories.join(',') : 'none';
    const cacheKey = `${naicsDigits}-${arcCode}-${catKey}`;

    if (resolverCache.has(cacheKey)) {
        return resolverCache.get(cacheKey)!;
    }

    try {
        // Backend now handles all fallback logic natively when querying distributions
        const dists = await api.getMeasureDistributions(naicsDigits, arcCode, categories);

        const validCount = dists.valid_count ?? dists.cce_primary.length;
        const scope = dists.scope_used || 'exact';
        const usedPrefix = dists.naics_prefix_used || naicsDigits;

        const reason = validCount > 0
            ? (validCount >= minValidN ? 'ok' : 'insufficient_data')
            : (scope === 'all' || scope === 'none' ? 'no_data_found' : 'insufficient_data');

        const result: ResolverResult = {
            scope: scope as 'exact' | 'prefix' | 'all',
            usedNaicsPrefix: usedPrefix,
            validCount,
            reason: reason as 'ok' | 'insufficient_data' | 'no_data_found',
            distributions: dists,
        };

        resolverCache.set(cacheKey, result);
        return result;
    } catch (err) {
        console.error(`Error fetching distributions for NAICS ${naicsDigits}:`, err);
        return {
            scope: 'exact',
            usedNaicsPrefix: naicsDigits,
            validCount: 0,
            reason: 'no_data_found',
            distributions: null,
        };
    }
}
