import CryptoJS from "crypto-js";

/**
 * Decrypt encrypted data using AES decryption
 * @param encryptedData - The encrypted data string
 * @param passphrase - The passphrase/key for decryption
 * @returns Decrypted data (parsed JSON if possible, otherwise string)
 */
// export function decryptDataApi(encryptedData: string, passphrase: string) {
//   console.log("encryptedData", encryptedData);
//   console.log("passphrase", passphrase);
  
//   const bytes = CryptoJS.AES.decrypt(encryptedData, passphrase);
//   const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

//   console.log("decryptedString", decryptedString);

//   try {
//     return decryptedString;
//   } catch (error) {
//     console.log("error", error);
//     console.log("decryptedString", decryptedString);
//     return decryptedString;
//   }
// }


export function decryptDataApi(encryptedData: string, passphrase: string) {
    const bytes = CryptoJS.AES.decrypt(encryptedData, passphrase);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8); 
  
    try {
      return JSON.parse(decryptedString);
    } catch {
      return decryptedString;
    }
  }
