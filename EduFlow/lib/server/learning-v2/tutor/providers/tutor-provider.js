export class TutorProvider {
  available() { return false }
  async generate() { throw new Error('Tutor provider is not implemented') }
}

