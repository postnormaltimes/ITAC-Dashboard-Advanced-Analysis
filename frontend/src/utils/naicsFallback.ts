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
 * Resolves the best NAICS scope for a given measure's CCE distribution.
 * It iteratively broadens the NAICS prefix (down to minNaicsDigits) until it finds
 * at least minValidN CCE observations. If none qualify, it falls back to 'all'.
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

    let bestInvalidScope: { prefix: string, count: number, dists: MeasureDistributionResponse } | null = null;

    // 1. Try exact match and prefixes down to minNaicsDigits
    for (let len = naicsDigits.length; len >= minNaicsDigits; len--) {
        const prefix = naicsDigits.slice(0, len);

        try {
            const dists = await api.getMeasureDistributions(prefix, arcCode, categories);
            const validCount = dists.cce_primary.length; // Array of non-null CCE values

            if (validCount >= minValidN) {
                const result: ResolverResult = {
                    scope: len === naicsDigits.length ? 'exact' : 'prefix',
                    usedNaicsPrefix: prefix,
                    validCount,
                    reason: 'ok',
                    distributions: dists,
                };
                resolverCache.set(cacheKey, result);
                return result;
            }

            // Keep track of the fallback with the highest valid count > 0
            if (validCount > 0) {
                if (!bestInvalidScope || validCount > bestInvalidScope.count) {
                    bestInvalidScope = { prefix, count: validCount, dists };
                }
            }

        } catch (err) {
            console.error(`Error fetching distributions for NAICS ${prefix}:`, err);
            // Continue trying broader prefixes
        }
    }

    // 2. If NO prefix met minValidN, check if we found ANY data > 0
    if (bestInvalidScope) {
        const result: ResolverResult = {
            scope: bestInvalidScope.prefix === naicsDigits ? 'exact' : 'prefix',
            usedNaicsPrefix: bestInvalidScope.prefix,
            validCount: bestInvalidScope.count,
            reason: 'insufficient_data',
            distributions: bestInvalidScope.dists,
        };
        resolverCache.set(cacheKey, result);
        return result;
    }

    // 3. Fallback to "all" (empty NAICS string) ONLY if absolutely 0 data in all prefixes
    try {
        const allDists = await api.getMeasureDistributions('', arcCode, categories);
        const validCount = allDists.cce_primary.length;

        const result: ResolverResult = {
            scope: 'all',
            usedNaicsPrefix: null,
            validCount,
            reason: validCount >= minValidN ? 'ok' : 'no_data_found',
            distributions: allDists,
        };
        resolverCache.set(cacheKey, result);
        return result;
    } catch (err) {
        console.error(`Error fetching fallback distributions for 'all':`, err);
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
