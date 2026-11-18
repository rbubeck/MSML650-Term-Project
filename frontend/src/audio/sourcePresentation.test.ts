import { describe, expect, it } from 'vitest';
import { audioFormatLabel, audioSourceExplanation } from './sourcePresentation';

describe('audio source presentation', () => {
  it('describes a two-source AWS capture as one ordered stereo transcript', () => {
    const selection = { microphone: true, system: true };

    expect(audioFormatLabel('aws', selection)).toContain('Stereo');
    expect(audioSourceExplanation('aws', selection)).toContain('separate stereo channels');
    expect(audioSourceExplanation('aws', selection)).toContain('one ordered transcript');
    expect(audioSourceExplanation('aws', selection)).not.toContain('mixed into one transcript');
  });

  it('describes mock two-source capture without claiming AWS stereo', () => {
    const selection = { microphone: true, system: true };

    expect(audioFormatLabel('mock', selection)).toContain('Dual mono');
    expect(audioSourceExplanation('mock', selection)).toContain('two simulated audio streams');
    expect(audioSourceExplanation('mock', selection)).toContain('one transcript');
  });

  it('keeps each individual source mono and gives source-specific guidance', () => {
    expect(audioFormatLabel('aws', { microphone: true, system: false })).toContain('Mono');
    expect(audioSourceExplanation('aws', { microphone: true, system: false })).not.toContain(
      'sharing picker. Enable',
    );
    expect(audioSourceExplanation('aws', { microphone: false, system: true })).toContain(
      'Enable Share audio',
    );
  });
});
