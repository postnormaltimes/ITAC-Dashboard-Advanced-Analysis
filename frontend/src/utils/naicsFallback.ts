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
    const cacheKey = `${naicsDigits}-${arcCode}-${catKey}-${minNaicsDigits}-${minValidN}`;

    if (resolverCache.has(cacheKey)) {
        return resolverCache.get(cacheKey)!;
    }

    let bestInvalidScope: { prefix: string; count: number; dists: MeasureDistributionResponse } | null = null;

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

            if (validCount > 0) {
                if (!bestInvalidScope || validCount > bestInvalidScope.count) {
                    bestInvalidScope = { prefix, count: validCount, dists };
                }
            }
        } catch (err) {
            console.error(`Error fetching distributions for NAICS ${prefix}:`, err);
        }
    }

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
