/**
 * Immutable schema-v1 values that may already be present inside signed or
 * hash-linked local records. These values are accepted only while reading old
 * records; new records and every public presentation use the current brand.
 */
export const LEGACY_SELF_REPORTED_ASSURANCE_LIMITATION =
  'This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.' as const;
