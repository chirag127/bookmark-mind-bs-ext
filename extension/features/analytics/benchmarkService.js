/**
 * BookmarkMind - Benchmark Service
 * Automated benchmark suite for evaluating categorization accuracy and performance
 */

export class BenchmarkService {
  constructor() {
    this.testSets = this._initializeTestSets();
    this.results = [];
  }

  /**
   * Initialize predefined test bookmark sets
   * @returns {Object} Test sets by category
   */
  _initializeTestSets() {
    return {
      technical: [
        {
          title: 'React Documentation',
          url: 'https://react.dev',
          expectedCategory: 'Development > Frontend'
        },
        {
          title: 'Stack Overflow - JavaScript',
          url: 'https://stackoverflow.com/questions/tagged/javascript',
          expectedCategory: 'Development > Resources'
        },
        {
          title: 'GitHub - TypeScript',
          url: 'https://github.com/microsoft/TypeScript',
          expectedCategory: 'Development > Tools'
        },
        {
          title: 'MDN Web Docs',
          url: 'https://developer.mozilla.org',
          expectedCategory: 'Development > Resources'
        },
        {
          title: 'Node.js Documentation',
          url: 'https://nodejs.org/docs',
          expectedCategory: 'Development > Backend'
        },
        {
          title: 'AWS Console',
          url: 'https://console.aws.amazon.com',
          expectedCategory: 'Development > Cloud'
        },
        {
          title: 'Docker Hub',
          url: 'https://hub.docker.com',
          expectedCategory: 'Development > DevOps'
        },
        {
          title: 'VS Code Tips',
          url: 'https://code.visualstudio.com/docs',
          expectedCategory: 'Development > Tools'
        },
        {
          title: 'Python Tutorial',
          url: 'https://docs.python.org/3/tutorial',
          expectedCategory: 'Development > Learning'
        },
        {
          title: 'CSS-Tricks',
          url: 'https://css-tricks.com',
          expectedCategory: 'Development > Design'
        }
      ],
      news: [
        {
          title: 'TechCrunch',
          url: 'https://techcrunch.com',
          expectedCategory: 'News > Technology'
        },
        { title: 'BBC News', url: 'https://www.bbc.com/news', expectedCategory: 'News > World' },
        {
          title: 'The Verge',
          url: 'https://www.theverge.com',
          expectedCategory: 'News > Technology'
        },
        {
          title: 'Hacker News',
          url: 'https://news.ycombinator.com',
          expectedCategory: 'News > Technology'
        },
        { title: 'Reuters', url: 'https://www.reuters.com', expectedCategory: 'News > World' },
        {
          title: 'Bloomberg',
          url: 'https://www.bloomberg.com',
          expectedCategory: 'News > Finance'
        },
        {
          title: 'Wired Magazine',
          url: 'https://www.wired.com',
          expectedCategory: 'News > Technology'
        },
        {
          title: 'The Guardian',
          url: 'https://www.theguardian.com',
          expectedCategory: 'News > World'
        },
        {
          title: 'Ars Technica',
          url: 'https://arstechnica.com',
          expectedCategory: 'News > Technology'
        },
        { title: 'NPR News', url: 'https://www.npr.org', expectedCategory: 'News > World' }
      ],
      shopping: [
        { title: 'Amazon', url: 'https://www.amazon.com', expectedCategory: 'Shopping > General' },
        {
          title: 'eBay Deals',
          url: 'https://www.ebay.com/deals',
          expectedCategory: 'Shopping > Deals'
        },
        {
          title: 'Etsy Handmade',
          url: 'https://www.etsy.com/market/handmade',
          expectedCategory: 'Shopping > Handmade'
        },
        {
          title: 'Best Buy Electronics',
          url: 'https://www.bestbuy.com',
          expectedCategory: 'Shopping > Electronics'
        },
        { title: 'Target', url: 'https://www.target.com', expectedCategory: 'Shopping > General' },
        {
          title: 'Walmart',
          url: 'https://www.walmart.com',
          expectedCategory: 'Shopping > General'
        },
        {
          title: 'Newegg Tech',
          url: 'https://www.newegg.com',
          expectedCategory: 'Shopping > Electronics'
        },
        {
          title: 'Zappos Shoes',
          url: 'https://www.zappos.com',
          expectedCategory: 'Shopping > Fashion'
        },
        {
          title: 'IKEA Furniture',
          url: 'https://www.ikea.com',
          expectedCategory: 'Shopping > Home'
        },
        {
          title: 'AliExpress',
          url: 'https://www.aliexpress.com',
          expectedCategory: 'Shopping > International'
        }
      ],
      entertainment: [
        {
          title: 'Netflix',
          url: 'https://www.netflix.com',
          expectedCategory: 'Entertainment > Streaming'
        },
        {
          title: 'YouTube',
          url: 'https://www.youtube.com',
          expectedCategory: 'Entertainment > Video'
        },
        {
          title: 'Spotify',
          url: 'https://www.spotify.com',
          expectedCategory: 'Entertainment > Music'
        },
        {
          title: 'IMDb Movies',
          url: 'https://www.imdb.com',
          expectedCategory: 'Entertainment > Movies'
        },
        {
          title: 'Twitch',
          url: 'https://www.twitch.tv',
          expectedCategory: 'Entertainment > Gaming'
        },
        {
          title: 'Reddit',
          url: 'https://www.reddit.com',
          expectedCategory: 'Entertainment > Social'
        },
        {
          title: 'Steam Games',
          url: 'https://store.steampowered.com',
          expectedCategory: 'Entertainment > Gaming'
        },
        {
          title: 'SoundCloud',
          url: 'https://soundcloud.com',
          expectedCategory: 'Entertainment > Music'
        },
        {
          title: 'Disney Plus',
          url: 'https://www.disneyplus.com',
          expectedCategory: 'Entertainment > Streaming'
        },
        {
          title: 'IGN Gaming News',
          url: 'https://www.ign.com',
          expectedCategory: 'Entertainment > Gaming'
        }
      ]
    };
  }

  /**
   * Run complete benchmark suite
   * @param {Object} options - Benchmark options
   * @returns {Promise<Object>} Benchmark results
   */
  async runBenchmarkSuite(options = {}) {
    const {
      providers = ['gemini', 'cerebras', 'groq'],
      models = null, // null = test all available models
      testCategories = ['technical', 'news', 'shopping', 'entertainment'],
      batchSize = 10
    } = options;

    console.log('🧪 Starting benchmark suite...');
    console.log('Options:', { providers, testCategories, batchSize });

    const results = {
      timestamp: Date.now(),
      providers: [],
      summary: {
        totalTests: 0,
        totalDuration: 0,
        averageAccuracy: 0,
        averageSpeed: 0,
        totalCost: 0
      }
    };

    const startTime = Date.now();

    // Test each provider
    for (const provider of providers) {
      console.log(`\n📊 Testing provider: ${provider}`);

      try {
        const providerResult = await this._testProvider(
          provider,
          testCategories,
          batchSize,
          models
        );
        results.providers.push(providerResult);

        results.summary.totalTests += providerResult.totalTests;
        results.summary.totalCost += providerResult.totalCost;
      } catch (_error) {
        console.error(`_error testing provider ${provider}:`, _error);
        results.providers.push({
          provider,
          error: _error.message,
          totalTests: 0,
          successRate: 0,
          averageSpeed: 0,
          totalCost: 0
        });
      }
    }

    results.summary.totalDuration = Date.now() - startTime;
    results.summary.averageAccuracy = this._calculateAverageAccuracy(results.providers);
    results.summary.averageSpeed = this._calculateAverageSpeed(results.providers);

    console.log('\n✅ Benchmark suite complete');
    console.log('Summary:', results.summary);

    // Save results
    await this._saveResults(results);

    return results;
  }

  /**
   * Test a specific provider with all models
   * @param {string} provider - Provider name
   * @param {Array} testCategories - Categories to test
   * @param {number} batchSize - Batch size for testing
   * @param {Array|null} specificModels - Specific models to test (null = all)
   * @returns {Promise<Object>} Provider test results
   */
  async _testProvider(provider, testCategories, batchSize, specificModels = null) {
    const aiProcessor = new AIProcessor();
    const settings = await this._getSettings();

    // Configure API keys
    aiProcessor.setApiKey(settings.apiKey, settings.cerebrasApiKey, settings.groqApiKey);

    // Get models to test for this provider
    const modelsToTest = this._getModelsForProvider(provider, aiProcessor, specificModels);

    const providerResult = {
      provider,
      models: [],
      totalTests: 0,
      successRate: 0,
      averageSpeed: 0,
      totalCost: 0,
      folderConsistency: 1.0
    };

    // Test each model
    for (const model of modelsToTest) {
      console.log(`  Testing model: ${model.name}`);

      const modelResult = await this._testModel(
        aiProcessor,
        model,
        testCategories,
        batchSize,
        provider
      );
      providerResult.models.push(modelResult);

      providerResult.totalTests += modelResult.totalTests;
      providerResult.totalCost += modelResult.totalCost;
    }

    // Calculate provider averages
    if (providerResult.models.length > 0) {
      providerResult.successRate =
        providerResult.models.reduce((sum, m) => sum + m.successRate, 0) /
        providerResult.models.length;
      providerResult.averageSpeed =
        providerResult.models.reduce((sum, m) => sum + m.averageSpeed, 0) /
        providerResult.models.length;
      providerResult.folderConsistency =
        providerResult.models.reduce((sum, m) => sum + m.folderConsistency, 0) /
        providerResult.models.length;
    }

    return providerResult;
  }

  /**
   * Test a specific model
   * @param {AIProcessor} aiProcessor - AI processor instance
   * @param {Object} model - Model configuration
   * @param {Array} testCategories - Categories to test
   * @param {number} batchSize - Batch size
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} Model test results
   */
  async _testModel(aiProcessor, model, testCategories, batchSize, provider) {
    const modelResult = {
      modelName: model.name,
      provider: provider,
      totalTests: 0,
      correctPredictions: 0,
      successRate: 0,
      averageSpeed: 0,
      totalCost: 0,
      folderConsistency: 0,
      categoryResults: {},
      responseTimesMs: []
    };

    // Test each category
    for (const category of testCategories) {
      const categoryTests = this.testSets[category];
      if (!categoryTests) continue;

      const categoryResult = {
        category,
        total: categoryTests.length,
        correct: 0,
        partial: 0,
        incorrect: 0,
        avgSpeed: 0,
        cost: 0,
        predictions: []
      };

      // Test in batches
      for (let i = 0; i < categoryTests.length; i += batchSize) {
        const batch = categoryTests.slice(i, Math.min(i + batchSize, categoryTests.length));

        const startTime = Date.now();

        try {
          const results = await this._categorizeBatch(aiProcessor, batch, provider, model);

          const duration = Date.now() - startTime;
          const avgBatchSpeed = duration / batch.length;

          modelResult.responseTimesMs.push(duration);
          categoryResult.avgSpeed += avgBatchSpeed;

          // Evaluate predictions
          results.forEach((result, idx) => {
            const test = batch[idx];
            const accuracy = this._evaluatePrediction(result.category, test.expectedCategory);

            categoryResult.predictions.push({
              title: test.title,
              expected: test.expectedCategory,
              predicted: result.category,
              accuracy,
              confidence: result.confidence,
              responseTimeMs: avgBatchSpeed
            });

            if (accuracy === 'correct') categoryResult.correct++;
            else if (accuracy === 'partial') categoryResult.partial++;
            else categoryResult.incorrect++;
          });

          // Calculate cost for this batch
          const batchCost = this._calculateBatchCost(batch, results, model);
          categoryResult.cost += batchCost;
          modelResult.totalCost += batchCost;
        } catch (_error) {
          console.error(`_error testing batch for ${category}:`, _error);
          categoryResult.incorrect += batch.length;
        }
      }

      categoryResult.avgSpeed =
        categoryResult.avgSpeed / Math.ceil(categoryTests.length / batchSize);
      modelResult.categoryResults[category] = categoryResult;
      modelResult.totalTests += categoryResult.total;
      modelResult.correctPredictions += categoryResult.correct + categoryResult.partial * 0.5;
    }

    // Calculate overall metrics
    modelResult.successRate = (modelResult.correctPredictions / modelResult.totalTests) * 100;
    modelResult.averageSpeed =
      modelResult.responseTimesMs.reduce((sum, t) => sum + t, 0) /
      modelResult.responseTimesMs.length;
    modelResult.folderConsistency = this._evaluateFolderConsistency(modelResult.categoryResults);

    return modelResult;
  }

  /**
   * Categorize a batch of test bookmarks
   * @param {AIProcessor} aiProcessor - AI processor instance
   * @param {Array} batch - Batch of bookmarks to categorize
   * @param {string} provider - Provider name
   * @param {Object} model - Model configuration
   * @returns {Promise<Array>} Categorization results
   */
  async _categorizeBatch(aiProcessor, batch, provider, model) {
    // Mock bookmark objects for AI processing
    const mockBookmarks = batch.map((test, idx) => ({
      id: `benchmark_${Date.now()}_${idx}`,
      title: test.title,
      url: test.url,
      parentId: '1'
    }));

    // Set the specific model to test
    if (provider === 'gemini') {
      const modelIndex = aiProcessor.geminiModels.findIndex((m) => m.name === model.name);
      if (modelIndex >= 0) aiProcessor.currentModelIndex = modelIndex;
    }

    try {
      const result = await aiProcessor.categorizeBookmarks(mockBookmarks, [], {});
      return result.results || [];
    } catch (_error) {
      console.error('Categorization _error:', _error);
      return mockBookmarks.map(() => ({ category: 'Other', confidence: 0, reasoning: 'Error' }));
    }
  }

  /**
   * Evaluate prediction accuracy
   * @param {string} predicted - Predicted category
   * @param {string} expected - Expected category
   * @returns {string} Accuracy level: 'correct', 'partial', 'incorrect'
   */
  _evaluatePrediction(predicted, expected) {
    if (!predicted || !expected) return 'incorrect';

    // Exact match
    if (predicted === expected) return 'correct';

    // Partial match (parent category matches)
    const predictedParts = predicted.split('>').map((p) => p.trim());
    const expectedParts = expected.split('>').map((p) => p.trim());

    // Check if parent category matches
    if (predictedParts[0] === expectedParts[0]) {
      return 'partial';
    }

    return 'incorrect';
  }

  /**
   * Evaluate folder structure consistency
   * @param {Object} categoryResults - Results by category
   * @returns {number} Consistency score (0-1)
   */
  _evaluateFolderConsistency(categoryResults) {
    let totalPredictions = 0;
    let consistentPredictions = 0;

    Object.values(categoryResults).forEach((result) => {
      const folderMap = {};

      result.predictions.forEach((pred) => {
        const parentFolder = pred.predicted.split('>')[0]?.trim();
        if (parentFolder) {
          folderMap[parentFolder] = (folderMap[parentFolder] || 0) + 1;
          totalPredictions++;
        }
      });

      // Count predictions in most common folder
      const maxCount = Math.max(...Object.values(folderMap));
      consistentPredictions += maxCount;
    });

    return totalPredictions > 0 ? consistentPredictions / totalPredictions : 1.0;
  }

  /**
   * Calculate cost for a batch
   * @param {Array} batch - Input bookmarks
   * @param {Array} results - Output results
   * @param {Object} model - Model configuration
   * @returns {number} Cost in dollars
   */
  _calculateBatchCost(batch, results, model) {
    // Estimate token counts
    const avgTitleLength = batch.reduce((sum, b) => sum + b.title.length, 0) / batch.length;
    const avgUrlLength = batch.reduce((sum, b) => sum + b.url.length, 0) / batch.length;
    const inputTokens = (avgTitleLength + avgUrlLength) * batch.length * 0.75; // ~0.75 tokens per char

    const avgResultLength =
      results.reduce((sum, r) => sum + (r.category?.length || 0) + (r.reasoning?.length || 0), 0) /
      results.length;
    const outputTokens = avgResultLength * results.length * 0.75;

    const inputCost = (inputTokens / 1000000) * model.costPer1MInputTokens;
    const outputCost = (outputTokens / 1000000) * model.costPer1MOutputTokens;

    return inputCost + outputCost;
  }

  /**
   * Get models for provider
   * @param {string} provider - Provider name
   * @param {AIProcessor} aiProcessor - AI processor instance
   * @param {Array|null} specificModels - Specific models to test
   * @returns {Array} Models to test
   */
  _getModelsForProvider(provider, aiProcessor, specificModels) {
    let allModels = [];

    if (provider === 'gemini') {
      allModels = aiProcessor.geminiModels;
    } else if (provider === 'cerebras') {
      allModels = aiProcessor.cerebrasModels;
    } else if (provider === 'groq') {
      allModels = aiProcessor.groqModels;
    }

    if (specificModels) {
      return allModels.filter((m) => specificModels.includes(m.name));
    }

    // Test top 3 models per provider for efficiency
    return allModels.slice(0, 3);
  }

  /**
   * Calculate average accuracy across providers
   * @param {Array} providers - Provider results
   * @returns {number} Average accuracy percentage
   */
  _calculateAverageAccuracy(providers) {
    const validProviders = providers.filter((p) => !p.error && p.successRate);
    if (validProviders.length === 0) return 0;
    return validProviders.reduce((sum, p) => sum + p.successRate, 0) / validProviders.length;
  }

  /**
   * Calculate average speed across providers
   * @param {Array} providers - Provider results
   * @returns {number} Average speed in ms
   */
  _calculateAverageSpeed(providers) {
    const validProviders = providers.filter((p) => !p.error && p.averageSpeed);
    if (validProviders.length === 0) return 0;
    return validProviders.reduce((sum, p) => sum + p.averageSpeed, 0) / validProviders.length;
  }

  /**
   * Get user settings
   * @returns {Promise<Object>} Settings
   */
  async _getSettings() {
    const result = await chrome.storage.sync.get(['apiKey', 'cerebrasApiKey', 'groqApiKey']);
    return result;
  }

  /**
   * Save benchmark results
   * @param {Object} results - Benchmark results
   */
  async _saveResults(results) {
    try {
      // Get existing results
      const stored = await chrome.storage.local.get(['benchmarkHistory']);
      const history = stored.benchmarkHistory || [];

      // Add new results
      history.unshift({
        ...results,
        id: `benchmark_${Date.now()}`
      });

      // Keep last 50 results
      const trimmedHistory = history.slice(0, 50);

      await chrome.storage.local.set({ benchmarkHistory: trimmedHistory });
      console.log('✅ Benchmark results saved');
    } catch (_error) {
      console.error('_error saving benchmark results:', _error);
    }
  }

  /**
   * Get benchmark history
   * @param {number} limit - Maximum number of results to return
   * @returns {Promise<Array>} Historical results
   */
  async getHistory(limit = 10) {
    try {
      const stored = await chrome.storage.local.get(['benchmarkHistory']);
      const history = stored.benchmarkHistory || [];
      return history.slice(0, limit);
    } catch (_error) {
      console.error('_error loading benchmark history:', _error);
      return [];
    }
  }

  /**
   * Generate performance report
   * @param {Object} results - Benchmark results
   * @returns {Object} Performance report
   */
  generateReport(results) {
    const report = {
      timestamp: results.timestamp,
      date: new Date(results.timestamp).toLocaleString(),
      summary: results.summary,
      recommendations: [],
      bestModel: null,
      comparison: []
    };

    // Find best model based on weighted score
    let bestScore = 0;
    let bestModel = null;

    results.providers.forEach((provider) => {
      provider.models?.forEach((model) => {
        // Weighted score: 40% accuracy, 30% speed, 20% cost, 10% consistency
        const accuracyScore = model.successRate / 100;
        const speedScore = Math.max(0, 1 - model.averageSpeed / 5000); // Normalize to 5s max
        const costScore = Math.max(0, 1 - model.totalCost / 1); // Normalize to $1 max
        const consistencyScore = model.folderConsistency;

        const weightedScore =
          accuracyScore * 0.4 + speedScore * 0.3 + costScore * 0.2 + consistencyScore * 0.1;

        report.comparison.push({
          provider: provider.provider,
          model: model.modelName,
          successRate: model.successRate.toFixed(2),
          averageSpeed: model.averageSpeed.toFixed(0),
          totalCost: model.totalCost.toFixed(4),
          folderConsistency: (model.folderConsistency * 100).toFixed(1),
          score: weightedScore.toFixed(3)
        });

        if (weightedScore > bestScore) {
          bestScore = weightedScore;
          bestModel = {
            provider: provider.provider,
            model: model.modelName,
            successRate: model.successRate,
            averageSpeed: model.averageSpeed,
            totalCost: model.totalCost,
            folderConsistency: model.folderConsistency,
            score: weightedScore
          };
        }
      });
    });

    report.bestModel = bestModel;
    report.comparison.sort((a, b) => Number.parseFloat(b.score) - Number.parseFloat(a.score));

    // Generate recommendations
    if (bestModel) {
      report.recommendations.push({
        type: 'best_overall',
        message: `Use ${bestModel.provider}/${bestModel.model} for best overall performance`,
        details: `${bestModel.successRate.toFixed(1)}% accuracy, ${bestModel.averageSpeed.toFixed(0)}ms avg speed, $${bestModel.totalCost.toFixed(4)} total cost`
      });
    }

    // Find fastest model
    const fastest = report.comparison.reduce((min, m) =>
      Number.parseFloat(m.averageSpeed) < Number.parseFloat(min.averageSpeed) ? m : min
    );
    if (fastest) {
      report.recommendations.push({
        type: 'fastest',
        message: `Use ${fastest.provider}/${fastest.model} for fastest response`,
        details: `${fastest.averageSpeed}ms average response time`
      });
    }

    // Find cheapest model
    const cheapest = report.comparison.reduce((min, m) =>
      Number.parseFloat(m.totalCost) < Number.parseFloat(min.totalCost) ? m : min
    );
    if (cheapest) {
      report.recommendations.push({
        type: 'cheapest',
        message: `Use ${cheapest.provider}/${cheapest.model} for lowest cost`,
        details: `$${cheapest.totalCost} total cost for test suite`
      });
    }

    // Find most accurate model
    const accurate = report.comparison.reduce((max, m) =>
      Number.parseFloat(m.successRate) > Number.parseFloat(max.successRate) ? m : max
    );
    if (accurate) {
      report.recommendations.push({
        type: 'accurate',
        message: `Use ${accurate.provider}/${accurate.model} for highest accuracy`,
        details: `${accurate.successRate}% success rate`
      });
    }

    return report;
  }

  /**
   * Clear benchmark history
   */
  async clearHistory() {
    await chrome.storage.local.remove(['benchmarkHistory']);
    console.log('✅ Benchmark history cleared');
  }
}
