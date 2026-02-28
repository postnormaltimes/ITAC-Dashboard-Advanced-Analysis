export function sanitizeMeasureDescription(arcCode: string, description: string): string {
    if (!description || !arcCode) return description;

    const codeStr = arcCode.toString().trim();
    let descStr = description.trim();

    // 1) Strip leading "- " (dash+space)
    if (descStr.startsWith('- ')) {
        descStr = descStr.slice(2).trim();
    }

    // 2) Strip arcCode prefix with optional separator (space, dash, colon)
    const escapedCode = codeStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedCode}\\s*[-:]?\\s*`, 'i');

    return descStr.replace(regex, '');
}

