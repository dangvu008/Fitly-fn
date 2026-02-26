// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: image_validation.test.ts
 * Purpose: Property-based tests cho image validation logic
 * Layer: Infrastructure / Testing
 * 
 * Data Contract:
 * - Input: Random image data (valid/invalid)
 * - Output: Validation result (accept/reject)
 * 
 * Flow:
 * 1. Generate test images with various properties
 * 2. Validate using image_validator
 * 3. Verify correct accept/reject decisions
 * 
 * Security Note: Tests magic byte detection, size limits
 * 
 * Feature: supabase-gemini-integration
 * Property 5: Image Upload Validation
 * Validates: Requirements 2.1, 7.6
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

// Import validator (adjust path as needed)
import { validateImage, getFileExtension } from "../functions/lib/image_validator.ts";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Helper: Create valid JPEG magic bytes
 */
function createJpegMagicBytes(): Uint8Array {
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG SOI + APP0
}

/**
 * Helper: Create valid PNG magic bytes
 */
function createPngMagicBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
}

/**
 * Helper: Create invalid magic bytes
 */
function createInvalidMagicBytes(): Uint8Array {
  return new Uint8Array([0x00, 0x00, 0x00, 0x00]); // Not a valid image
}

/**
 * Helper: Convert Uint8Array to base64
 */
function arrayToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Helper: Create image buffer with specific size
 */
function createImageBuffer(magicBytes: Uint8Array, totalSize: number): Uint8Array {
  const buffer = new Uint8Array(totalSize);
  buffer.set(magicBytes, 0);
  // Fill rest with random data
  for (let i = magicBytes.length; i < totalSize; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

/**
 * Property 5a: Valid JPEG Images Are Accepted
 * 
 * Specification:
 * ∀ image where:
 *   - Magic bytes = FF D8 FF
 *   - Size <= 10MB
 * → validateImage(image).valid === true
 */
Deno.test({
  name: "Property 5a: Valid JPEG Images Are Accepted",
  fn: () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: MAX_FILE_SIZE }), // Random size <= 10MB
        (size) => {
          // Create valid JPEG
          const jpegBuffer = createImageBuffer(createJpegMagicBytes(), size);
          const base64 = arrayToBase64(jpegBuffer);

          // Validate
          const result = validateImage(base64);

          // Verify
          if (!result.valid) {
            throw new Error(
              `Valid JPEG rejected: ${result.error}\n` +
              `Size: ${size} bytes`
            );
          }

          if (result.mimeType !== 'image/jpeg') {
            throw new Error(
              `Wrong MIME type: ${result.mimeType} (expected: image/jpeg)`
            );
          }
        }
      ),
      { numRuns: 100 }
    );

    console.log("✅ Property 5a verified: Valid JPEGs accepted");
  },
});

/**
 * Property 5b: Valid PNG Images Are Accepted
 */
Deno.test({
  name: "Property 5b: Valid PNG Images Are Accepted",
  fn: () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: MAX_FILE_SIZE }),
        (size) => {
          // Create valid PNG
          const pngBuffer = createImageBuffer(createPngMagicBytes(), size);
          const base64 = arrayToBase64(pngBuffer);

          // Validate
          const result = validateImage(base64);

          // Verify
          if (!result.valid) {
            throw new Error(
              `Valid PNG rejected: ${result.error}\n` +
              `Size: ${size} bytes`
            );
          }

          if (result.mimeType !== 'image/png') {
            throw new Error(
              `Wrong MIME type: ${result.mimeType} (expected: image/png)`
            );
          }
        }
      ),
      { numRuns: 100 }
    );

    console.log("✅ Property 5b verified: Valid PNGs accepted");
  },
});

/**
 * Property 5c: Oversized Images Are Rejected
 * 
 * Specification:
 * ∀ image where size > 10MB:
 * → validateImage(image).valid === false
 */
Deno.test({
  name: "Property 5c: Oversized Images Are Rejected",
  fn: () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_FILE_SIZE + 1, max: MAX_FILE_SIZE + 5 * 1024 * 1024 }), // 10MB - 15MB
        (size) => {
          // Create oversized JPEG
          const jpegBuffer = createImageBuffer(createJpegMagicBytes(), size);
          const base64 = arrayToBase64(jpegBuffer);

          // Validate
          const result = validateImage(base64);

          // Verify rejection
          if (result.valid) {
            throw new Error(
              `Oversized image accepted!\n` +
              `Size: ${(size / 1024 / 1024).toFixed(2)}MB (max: 10MB)`
            );
          }

          // Verify error message mentions size
          if (!result.error?.includes('size') && !result.error?.includes('exceeds')) {
            throw new Error(
              `Error message doesn't mention size: ${result.error}`
            );
          }
        }
      ),
      { numRuns: 50 }
    );

    console.log("✅ Property 5c verified: Oversized images rejected");
  },
});

/**
 * Property 5d: Invalid Image Formats Are Rejected
 * 
 * Specification:
 * ∀ file where magic bytes ≠ JPEG and ≠ PNG:
 * → validateImage(file).valid === false
 */
Deno.test({
  name: "Property 5d: Invalid Image Formats Are Rejected",
  fn: () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 8, maxLength: 8 })
          .filter(bytes => {
            // Filter out valid JPEG/PNG magic bytes
            const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
            const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
            return !isJpeg && !isPng;
          }),
        fc.integer({ min: 1000, max: 100000 }), // Small size for speed
        (magicBytes, size) => {
          // Create invalid image
          const buffer = createImageBuffer(new Uint8Array(magicBytes), size);
          const base64 = arrayToBase64(buffer);

          // Validate
          const result = validateImage(base64);

          // Verify rejection
          if (result.valid) {
            throw new Error(
              `Invalid format accepted!\n` +
              `Magic bytes: ${magicBytes.slice(0, 4).map(b => b.toString(16)).join(' ')}`
            );
          }

          // Verify error message mentions format
          if (!result.error?.includes('format') && !result.error?.includes('supported')) {
            throw new Error(
              `Error message doesn't mention format: ${result.error}`
            );
          }
        }
      ),
      { numRuns: 100 }
    );

    console.log("✅ Property 5d verified: Invalid formats rejected");
  },
});

/**
 * Property 5e: Boundary Test - Exactly 10MB
 */
Deno.test({
  name: "Property 5e: Boundary Test - Exactly 10MB Is Accepted",
  fn: () => {
    // Create image exactly 10MB
    const exactSize = MAX_FILE_SIZE;
    const jpegBuffer = createImageBuffer(createJpegMagicBytes(), exactSize);
    const base64 = arrayToBase64(jpegBuffer);

    const result = validateImage(base64);

    assertEquals(result.valid, true, "10MB image should be accepted");
    assertEquals(result.mimeType, 'image/jpeg', "Should detect JPEG");

    // Test 10MB + 1 byte (should be rejected)
    const oversizedBuffer = createImageBuffer(createJpegMagicBytes(), exactSize + 1);
    const oversizedBase64 = arrayToBase64(oversizedBuffer);

    const oversizedResult = validateImage(oversizedBase64);

    assertEquals(oversizedResult.valid, false, "10MB + 1 byte should be rejected");

    console.log("✅ Property 5e verified: Boundary case (10MB accepted, 10MB+1 rejected)");
  },
});

/**
 * Property 5f: Base64 with Data URL Prefix
 */
Deno.test({
  name: "Property 5f: Base64 with Data URL Prefix Is Handled",
  fn: () => {
    fc.assert(
      fc.property(
        fc.constantFrom('image/jpeg', 'image/png'),
        fc.integer({ min: 1000, max: 100000 }),
        (mimeType, size) => {
          // Create valid image
          const magicBytes = mimeType === 'image/jpeg'
            ? createJpegMagicBytes()
            : createPngMagicBytes();
          const buffer = createImageBuffer(magicBytes, size);
          const base64 = arrayToBase64(buffer);

          // Add data URL prefix
          const dataUrl = `data:${mimeType};base64,${base64}`;

          // Validate
          const result = validateImage(dataUrl);

          // Verify
          if (!result.valid) {
            throw new Error(
              `Valid image with data URL prefix rejected: ${result.error}`
            );
          }

          if (result.mimeType !== mimeType) {
            throw new Error(
              `Wrong MIME type: ${result.mimeType} (expected: ${mimeType})`
            );
          }
        }
      ),
      { numRuns: 50 }
    );

    console.log("✅ Property 5f verified: Data URL prefix handled correctly");
  },
});

/**
 * Property 5g: File Extension Mapping
 */
Deno.test({
  name: "Property 5g: File Extension Mapping Is Correct",
  fn: () => {
    assertEquals(getFileExtension('image/jpeg'), 'jpg', "JPEG → jpg");
    assertEquals(getFileExtension('image/png'), 'png', "PNG → png");
    assertEquals(getFileExtension('image/gif'), 'bin', "Unsupported → bin");
    assertEquals(getFileExtension('application/pdf'), 'bin', "Non-image → bin");

    console.log("✅ Property 5g verified: File extension mapping correct");
  },
});

/**
 * Property 5h: Malformed Base64 Is Rejected
 */
Deno.test({
  name: "Property 5h: Malformed Base64 Is Rejected",
  fn: () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 100 })
          .filter(s => {
            // Generate strings that are NOT valid base64
            try {
              atob(s);
              return false; // Valid base64, skip
            } catch {
              return true; // Invalid base64, use it
            }
          }),
        (invalidBase64) => {
          const result = validateImage(invalidBase64);

          // Should be rejected
          if (result.valid) {
            throw new Error(
              `Malformed base64 accepted: ${invalidBase64.substring(0, 20)}...`
            );
          }

          // Error should mention decoding
          if (!result.error?.includes('decode') && !result.error?.includes('Failed')) {
            throw new Error(
              `Error message doesn't mention decoding: ${result.error}`
            );
          }
        }
      ),
      { numRuns: 50 }
    );

    console.log("✅ Property 5h verified: Malformed base64 rejected");
  },
});
