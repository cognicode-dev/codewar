export class CodingArenaSDK {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async getStatus(): Promise<{ status: string }> {
    const res = await fetch(`${this.apiUrl}/status`);
    return res.json();
  }
}
