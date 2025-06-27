export interface CSVOptions { delimiter?: string; header?: boolean; }
export class CSVLoader {
    static async load(text: string, opts: CSVOptions = {}): Promise<Record<string,string>[]> {
        const delim = opts.delimiter ?? ",";
        const lines = text.trim().split("\n");
        const [headerLine, ...rows] = lines;
        const headers = headerLine.split(delim).map(h => h.trim());
        return rows.map(line => {
            const values = line.split(delim);
            const obj: Record<string,string> = {};
            headers.forEach((h,i) => obj[h] = values[i]?.trim() ?? "");
            return obj;
        });
    }
}