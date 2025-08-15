const positiveKeywords = [
  // Explicit positive words
  'great', 'awesome', 'thank', 'thanks', 'love', 'sounds good', 'interested',
  'perfect', 'wonderful', 'excellent', 'amazing', 'fantastic', 'sure', 'yes',
  'appreciate', 'helpful', 'looking forward', 'good', 'nice', 'happy',
  
  // Interest indicators
  'would love to', 'curious to', 'excited to', 'can i join', 'sign me up',
  'count me in', 'let me try', 'want to try', 'sounds interesting',
  
  // Affirmative responses
  'cool', 'absolutely', 'definitely', 'for sure', 'yeah', 'yep', 'okay', 'ok',
  'lets do it', "let's do it", 'will do', 'done', 'upvoted', '👍', '✅'
];

const negativeKeywords = [
  // Explicit rejections
  'no thanks', 'not interested', 'stop', 'unsubscribe', 'remove', 'spam',
  'do not contact', 'don\'t contact', 'leave me alone', 'go away', 'busy',
  'not now', 'never', 'waste', 'annoying', 'irrelevant', 'not looking',
  'no need', 'decline', 'not a good fit',
  
  // Negative indicators
  'bad', 'poor', 'terrible', 'horrible', 'worst', 'useless', 'not helpful',
  'expensive', 'not worth', 'disappointed', 'frustrating', 'difficult',
  
  // Dismissive responses
  'don\'t bother', 'no way', 'nope', 'pass', 'not for me', 'wrong person',
  'not relevant', 'not appropriate', '👎'
];

/**
 * Analyzes the sentiment of a text message using keyword matching
 * @param {string} text - The text to analyze
 * @returns {'Positive' | 'Negative' | 'Neutral'} The sentiment classification
 */
function analyzeSentiment(text) {
  if (!text) return 'Neutral';
  
  const lowerText = text.toLowerCase();
  
  // Check for positive keywords
  const hasPositive = positiveKeywords.some(keyword => {
    // For emoji and special characters, use direct matching
    if (keyword.length === 2 && keyword.charCodeAt(0) > 255) {
      return text.includes(keyword);
    }
    return lowerText.includes(keyword.toLowerCase());
  });
  
  // Check for negative keywords
  const hasNegative = negativeKeywords.some(keyword => {
    // For emoji and special characters, use direct matching
    if (keyword.length === 2 && keyword.charCodeAt(0) > 255) {
      return text.includes(keyword);
    }
    return lowerText.includes(keyword.toLowerCase());
  });
  
  // If both positive and negative keywords are found, analyze context
  if (hasPositive && hasNegative) {
    // If the text is short and has a thumbs up, consider it positive
    if (text.length < 50 && text.includes('👍')) return 'Positive';
    // If it's a longer message, default to neutral
    return 'Neutral';
  }
  
  // Return based on keyword presence
  if (hasPositive) return 'Positive';
  if (hasNegative) return 'Negative';
  
  // Check for short responses that indicate interest
  if (text.length < 30) {
    if (/^(yes|yeah|sure|ok|okay|cool|interested|let'?s do it)[\s!]*$/i.test(lowerText)) {
      return 'Positive';
    }
  }
  
  return 'Neutral';
}

/**
 * Get an emoji representation of the sentiment
 * @param {string} sentiment - The sentiment classification
 * @returns {string} An emoji representing the sentiment
 */
function getSentimentEmoji(sentiment) {
  switch (sentiment) {
    case 'Positive':
      return '😊';
    case 'Negative':
      return '😞';
    default:
      return '😐';
  }
}

module.exports = {
  analyzeSentiment,
  getSentimentEmoji
}; 