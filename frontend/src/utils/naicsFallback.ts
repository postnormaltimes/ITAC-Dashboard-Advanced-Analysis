import { api } from '../api/client';
import type { FirmSizeCategory, MeasureDistributionResponse } from '../types';

export interface ResolverResult {
    scope: 'exact' | 'prefix' | 'all';
    usedNaicsPrefix: string | null;
    validCount: number;
    reason: 'ok' | 'insufficient_data' | 'no_data_found';
    distributions: MeasureDistributionResponse | null;
}

// In-memory cache to prevent redundant API calls during rapid re-renders
const resolverCache = new Map<string, ResolverResult>();

/**
 * Extracts only the digits from a NAICS string
 */
export function normalizeNaics(naics: string): string {
    return naics.replace(/\D/g, '');
}

/**
 * Resolves NAICS scope for Step-2 CCE using strict hierarchy:
 * exact -> truncated prefixes (down to minNaicsDigits) -> all industries.
 * The first scope with any valid CCE values is selected.
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
    const cacheKey = `${naicsDigits}-${arcCode}-${catKey}-${minNaicsDigits}-${minValidN}`;

    if (resolverCache.has(cacheKey)) {
        return resolverCache.get(cacheKey)!;
    }

    for (let len = naicsDigits.length; len >= minNaicsDigits; len--) {
        const prefix = naicsDigits.slice(0, len);

        try {
            const dists = await api.getMeasureDistributions(prefix, arcCode, categories);
            const validCount = dists.cce_primary.length;

            if (validCount > 0) {
                const result: ResolverResult = {
                    scope: len === naicsDigits.length ? 'exact' : 'prefix',
                    usedNaicsPrefix: prefix,
                    validCount,
                    reason: validCount >= minValidN ? 'ok' : 'insufficient_data',
                    distributions: dists,
                };
                resolverCache.set(cacheKey, result);
                return result;
            }
        } catch (err) {
            console.error(`Error fetching distributions for NAICS ${prefix}:`, err);
        }
    }

    try {
        const allDists = await api.getMeasureDistributions('', arcCode, categories);
        const validCount = allDists.cce_primary.length;

        const result: ResolverResult = {
            scope: 'all',
            usedNaicsPrefix: null,
            validCount,
            reason: validCount > 0 ? (validCount >= minValidN ? 'ok' : 'insufficient_data') : 'no_data_found',
            distributions: allDists,
        };
        resolverCache.set(cacheKey, result);
        return result;
    } catch (err) {
        console.error("Error fetching fallback distributions for 'all':", err);
        const failResult: ResolverResult = {
            scope: 'all',
            usedNaicsPrefix: null,
            validCount: 0,
            reason: 'no_data_found',
            distributions: null,
        };
        resolverCache.set(cacheKey, failResult);
        return failResult;
    }
}
