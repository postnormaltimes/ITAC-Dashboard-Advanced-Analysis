export function sanitizeMeasureDescription(arcCode: string, description: string): string {
    if (!description || !arcCode) return description;
    
    // Prepare prefixes to check (e.g. "2.1111 - ", "2.1111: ", "2.1111")
    const codeStr = arcCode.toString().trim();
    const descStr = description.trim();
    
    // Simple regex: ^2\.1111\s*[-:]?\s*
    // Escape arcCode regex dots
    const escapedCode = codeStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedCode}\\s*[-:]?\\s*`, 'i');
    
    return descStr.replace(regex, '');
}
