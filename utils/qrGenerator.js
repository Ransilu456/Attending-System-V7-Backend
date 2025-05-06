import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * Generates a QR code with a pixel art dinosaur logo in the center,
 * exactly matching the reference image
 * @param {string} data - Data to encode in the QR code
 * @param {Object} options - Optional configuration
 * @returns {Promise<string>} - Base64 data URL of the QR code
 */
export const generateStylishQRCode = async (data, options = {}) => {
  try {
    // Set default options
    const config = {
      errorCorrectionLevel: 'H', // High error correction for logo space
      margin: 1,
      width: 400,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      // Make the QR code use dots instead of squares
      type: 'svg',
      rendererOpts: {
        quality: 1
      },
      ...options
    };

    // Generate the QR code as SVG first
    const qrSvg = await QRCode.toString(data, {
      ...config,
      type: 'svg'
    });
    
    // Convert SVG to use circles instead of rects for the modules
    const circleQrSvg = qrSvg.replace(/<rect([^>]*)\/>/g, (match, attributes) => {
      // Extract x, y, width, height from the attributes
      const x = attributes.match(/x="([^"]*)"/)?.[1] || '0';
      const y = attributes.match(/y="([^"]*)"/)?.[1] || '0';
      const width = attributes.match(/width="([^"]*)"/)?.[1] || '1';
      
      // Calculate circle center and radius
      const centerX = parseFloat(x) + parseFloat(width) / 2;
      const centerY = parseFloat(y) + parseFloat(width) / 2;
      const radius = parseFloat(width) / 2;
      
      // Return circle with the same fill and position
      return `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="black"/>`;
    });
    
    // Convert modified SVG to PNG buffer
    const qrBuffer = await sharp(Buffer.from(circleQrSvg))
      .resize(config.width, config.width)
      .png()
      .toBuffer();
      
    // Now create the exact pixel art dino logo from the reference
    const logoSize = Math.floor(config.width * 0.15); // 15% of QR code size
    const logoBuffer = await createExactDinoLogo(logoSize);
    
    // Calculate center position for the logo
    const position = Math.floor((config.width - logoSize) / 2);
    
    // Overlay the pixel art dinosaur logo on the QR code
    const finalQR = await sharp(qrBuffer)
      .composite([
        {
          input: logoBuffer,
          top: position,
          left: position
        }
      ])
      .png()
      .toBuffer();
    
    // Convert to base64
    return `data:image/png;base64,${finalQR.toString('base64')}`;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
};

/**
 * Creates the exact pixel art dinosaur logo matching the reference image
 * @param {number} size - Size of the logo in pixels
 * @returns {Promise<Buffer>} - Logo image buffer
 */
const createExactDinoLogo = async (size) => {
  // The exact pixel art dinosaur from the reference image
  const pixelArtDino = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="white" fill-opacity="0"/>
      <!-- T-Rex Shape - Exact match to reference image -->
      <!-- Head -->
      <rect x="6" y="4" width="3" height="2" fill="black"/>
      <rect x="9" y="3" width="2" height="3" fill="black"/>
      <!-- Eye -->
      <rect x="8" y="4" width="1" height="1" fill="white"/>
      <!-- Jaw -->
      <rect x="11" y="4" width="1" height="1" fill="black"/>
      <!-- Body -->
      <rect x="7" y="6" width="4" height="4" fill="black"/>
      <rect x="11" y="7" width="1" height="2" fill="black"/>
      <!-- Tail -->
      <rect x="12" y="6" width="3" height="1" fill="black"/>
      <!-- Arms -->
      <rect x="6" y="7" width="1" height="1" fill="black"/>
      <!-- Legs -->
      <rect x="8" y="10" width="1" height="2" fill="black"/>
      <rect x="10" y="10" width="1" height="2" fill="black"/>
    </svg>
  `;
  
  // Convert SVG to PNG with transparency
  return await sharp(Buffer.from(pixelArtDino))
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
};

export default generateStylishQRCode;
