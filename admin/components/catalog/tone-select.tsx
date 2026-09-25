import { Select } from "@/components/ui/input";
import { TONE_LABELS, TONES } from "@/lib/catalog";

export function ToneSelect({ value }: { value?: string }) {
  return (
    <Select name="tone" defaultValue={value ?? "academic"}>
      {TONES.map((tone) => (
        <option key={tone} value={tone}>
          {TONE_LABELS[tone]}
        </option>
      ))}
    </Select>
  );
}
