/**
 * CAPTCHA PROVIDER
 * generates image captchas for verification
 */

import { createCanvas } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';

export interface ICaptchaResult {
  code: string;
  attachment: AttachmentBuilder;
}

export class CaptchaProvider {
  // characters used for captcha (no confusing ones like 0/O, 1/I)
  private static readonly CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private static readonly LENGTH = 6;

  /**
   * Generate a random captcha code
   */
  static generateCode(): string {
    let code = '';
    for (let i = 0; i < this.LENGTH; i++) {
      code += this.CHARS[Math.floor(Math.random() * this.CHARS.length)];
    }
    return code;
  }

  /**
   * Generate a captcha image with the given code
   * returns both the code and a Discord attachment
   */
  static async generate(): Promise<ICaptchaResult> {
    const code = this.generateCode();
    const attachment = await this.createImage(code);
    return { code, attachment };
  }

  /**
   * Create the actual captcha image
   */
  private static async createImage(code: string): Promise<AttachmentBuilder> {
    const width = 300;
    const height = 100;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // background gradient (looks nicer than plain color)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#2c2f33');
    gradient.addColorStop(1, '#23272a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // draw some noise dots in background to make OCR harder
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // draw random lines accross the image
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `hsl(${Math.random() * 360}, 50%, 60%)`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);
      ctx.lineTo(Math.random() * width, Math.random() * height);
      ctx.stroke();
    }

    // draw the code letters with random rotation
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const letterSpacing = width / (code.length + 1);
    for (let i = 0; i < code.length; i++) {
      const x = letterSpacing * (i + 1);
      const y = height / 2 + (Math.random() - 0.5) * 10;
      const rotation = (Math.random() - 0.5) * 0.5; // small rotation each letter

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      
      // bright color thats easy to read but hard for bots
      const hue = Math.floor(Math.random() * 360);
      ctx.fillStyle = `hsl(${hue}, 80%, 70%)`;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(code[i], 0, 0);
      
      ctx.restore();
    }

    // some more noise lines on top of the text
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + Math.random() * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.random() * height);
      ctx.bezierCurveTo(
        width / 3, Math.random() * height,
        (width / 3) * 2, Math.random() * height,
        width, Math.random() * height
      );
      ctx.stroke();
    }

    // convert to png buffer and create discord attachment
    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'captcha.png' });
  }
}

export default CaptchaProvider;
