#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Environment variables configuration
const envConfig = {
    required: [
        {
            key: 'DATABASE_URL',
            description: 'PostgreSQL connection string',
            example: 'postgresql://user:password@localhost:5432/cairo',
            category: 'Database',
            examples: [
                'postgresql://user:password@localhost:5432/cairo',
                'postgresql://user:password@host.neon.tech/cairo?sslmode=require',
                'postgresql://user:password@db.railway.app:5432/railway'
            ]
        }
    ],
    enrichment: [
        {
            key: 'APOLLO_API_KEY',
            description: 'Apollo API key for lead enrichment (primary)',
            category: 'Lead Enrichment'
        },
        {
            key: 'HUNTER_API_KEY',
            description: 'Hunter.io API key for lead enrichment (fallback)',
            category: 'Lead Enrichment'
        }
    ],
    ai: [
        {
            key: 'ENABLE_AI_ENRICHMENT',
            description: 'Enable AI-first enrichment (true/false)',
            default: 'true',
            category: 'AI Enrichment'
        },
        {
            key: 'PERPLEXITY_API_KEY',
            description: 'Perplexity API key ($0.005/lead - recommended)',
            category: 'AI Enrichment'
        },
        {
            key: 'OPENAI_API_KEY',
            description: 'OpenAI API key ($0.01/lead)',
            category: 'AI Enrichment'
        },
        {
            key: 'ANTHROPIC_API_KEY',
            description: 'Anthropic API key ($0.008/lead)',
            category: 'AI Enrichment'
        }
    ],
    crm: [
        {
            key: 'ATTIO_API_KEY',
            description: 'Attio CRM API key for lead sync',
            category: 'CRM Integration'
        }
    ],
    analytics: [
        {
            key: 'MIXPANEL_PROJECT_TOKEN',
            description: 'Mixpanel project token for analytics',
            category: 'Analytics & Marketing'
        },
        {
            key: 'LEMLIST_API_KEY',
            description: 'Lemlist API key for email campaign data',
            category: 'Analytics & Marketing'
        },
        {
            key: 'SMARTLEAD_API_KEY',
            description: 'Smartlead API key for email campaign data',
            category: 'Analytics & Marketing'
        }
    ],
    namespaces: [
        {
            key: 'ENABLE_NAMESPACE_SYSTEM',
            description: 'Enable multi-tenant namespace system (true/false)',
            default: 'true',
            category: 'Multi-Tenant Namespaces'
        },
        {
            key: 'DEFAULT_NAMESPACE',
            description: 'Default namespace for uncategorized campaigns',
            default: 'playmaker',
            category: 'Multi-Tenant Namespaces'
        }
    ],
    server: [
        {
            key: 'PORT',
            description: 'Server port',
            default: '8080',
            category: 'Server Configuration'
        },
        {
            key: 'NODE_ENV',
            description: 'Node environment (development/production)',
            default: 'development',
            category: 'Server Configuration'
        },
        {
            key: 'LOG_LEVEL',
            description: 'Log level (debug/info/warn/error)',
            default: 'info',
            category: 'Server Configuration'
        }
    ],
    sync: [
        {
            key: 'USE_PERIODIC_SYNC',
            description: 'Enable automatic periodic sync (true/false)',
            default: 'true',
            category: 'Periodic Sync'
        },
        {
            key: 'SYNC_INTERVAL_HOURS',
            description: 'Sync interval in hours',
            default: '4',
            category: 'Periodic Sync'
        },
        {
            key: 'ENABLE_WEEKLY_ICP_SCORING',
            description: 'Enable weekly ICP scoring (true/false)',
            default: 'true',
            category: 'Periodic Sync'
        },
        {
            key: 'MIN_BEHAVIOR_SCORE_FOR_ATTIO',
            description: 'Minimum behavior score for Attio sync',
            default: '1',
            category: 'Periodic Sync'
        }
    ],
    optional: [
        {
            key: 'SENTRY_DSN',
            description: 'Sentry DSN for error tracking',
            category: 'Monitoring'
        },
        {
            key: 'JWT_SECRET',
            description: 'JWT secret for authentication',
            category: 'Security'
        },
        {
            key: 'WEBHOOK_SECRET',
            description: 'Webhook secret for security',
            category: 'Security'
        }
    ]
};

class EnvSetup {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.envVars = {};
    }

    log(message, color = 'reset') {
        console.log(`${colors[color]}${message}${colors.reset}`);
    }

    async question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }

    async setup() {
        this.log('\n🚀 Cairo Environment Setup', 'cyan');
        this.log('='.repeat(50), 'cyan');
        this.log('This script will help you configure your .env file for Cairo.');
        this.log('You can skip optional fields by pressing Enter.\n');

        const mode = await this.askSetupMode();

        if (mode === 'quick') {
            await this.quickSetup();
        } else {
            await this.fullSetup();
        }

        await this.writeEnvFile();
        this.rl.close();
    }

    async askSetupMode() {
        this.log('Choose setup mode:', 'yellow');
        this.log('1. Quick setup (minimal required configuration)');
        this.log('2. Full setup (all configuration options)');

        const choice = await this.question('\nEnter your choice (1 or 2): ');
        return choice === '1' ? 'quick' : 'full';
    }

    async quickSetup() {
        this.log('\n📋 Quick Setup - Required Configuration', 'green');
        this.log('-'.repeat(40), 'green');

        // Database (required)
        await this.askForVariable(envConfig.required[0]);

        // At least one enrichment method
        this.log('\n🔍 Lead Enrichment (choose at least one):', 'blue');
        const hasApollo = await this.askForVariable(envConfig.enrichment[0], true);
        if (!hasApollo) {
            await this.askForVariable(envConfig.enrichment[1]);
        }

        // CRM integration
        this.log('\n🔗 CRM Integration:', 'blue');
        await this.askForVariable(envConfig.crm[0]);

        // Basic server config
        this.log('\n⚙️ Basic Server Configuration:', 'blue');
        for (const variable of envConfig.server) {
            this.envVars[variable.key] = variable.default || '';
        }
        this.log('Using default server configuration...');
    }

    async fullSetup() {
        this.log('\n📋 Full Setup - All Configuration Options', 'green');
        this.log('-'.repeat(45), 'green');

        const categories = [
            { name: 'Database', items: envConfig.required },
            { name: 'Lead Enrichment', items: envConfig.enrichment },
            { name: 'AI Enrichment', items: envConfig.ai },
            { name: 'CRM Integration', items: envConfig.crm },
            { name: 'Analytics & Marketing', items: envConfig.analytics },
            { name: 'Multi-Tenant Namespaces', items: envConfig.namespaces },
            { name: 'Server Configuration', items: envConfig.server },
            { name: 'Periodic Sync', items: envConfig.sync },
            { name: 'Optional Services', items: envConfig.optional }
        ];

        for (const category of categories) {
            this.log(`\n📦 ${category.name}:`, 'blue');
            this.log('-'.repeat(20), 'blue');

            for (const variable of category.items) {
                await this.askForVariable(variable, true);
            }
        }
    }

    async askForVariable(variable, optional = false) {
        const isRequired = !optional && !variable.default;

        // Show multiple examples for DATABASE_URL
        if (variable.key === 'DATABASE_URL' && variable.examples) {
            this.log('\nDatabase URL examples:', 'cyan');
            variable.examples.forEach((example, index) => {
                const type = index === 0 ? 'Local' : index === 1 ? 'Neon' : 'Railway';
                this.log(`  ${type}: ${example}`, 'cyan');
            });
        }

        const prompt = `${variable.description}${variable.example ? ` (e.g., ${variable.example})` : ''}${variable.default ? ` [${variable.default}]` : ''}${isRequired ? ' (required)' : ''}: `;

        let value = await this.question(prompt);

        // Use default if empty and default exists
        if (!value && variable.default) {
            value = variable.default;
        }

        // Validate required fields
        if (isRequired && !value) {
            this.log('❌ This field is required!', 'red');
            return await this.askForVariable(variable, optional);
        }

        this.envVars[variable.key] = value;
        return !!value;
    }

    async writeEnvFile() {
        const envFilePath = path.join(process.cwd(), '.env');

        // Check if .env already exists
        if (fs.existsSync(envFilePath)) {
            const overwrite = await this.question('\n.env file already exists. Overwrite? (y/N): ');
            if (overwrite.toLowerCase() !== 'y') {
                this.log('❌ Setup cancelled.', 'red');
                return;
            }
        }

        // Generate .env content
        let envContent = '# Cairo Environment Configuration\n';
        envContent += '# Generated by setup-env.js\n\n';

        // Group variables by category
        const categories = {
            'Database': envConfig.required,
            'Lead Enrichment': envConfig.enrichment,
            'AI Enrichment': envConfig.ai,
            'CRM Integration': envConfig.crm,
            'Analytics & Marketing': envConfig.analytics,
            'Server Configuration': envConfig.server,
            'Periodic Sync': envConfig.sync,
            'Monitoring & Security': [...envConfig.optional]
        };

        for (const [categoryName, variables] of Object.entries(categories)) {
            envContent += `# ===== ${categoryName.toUpperCase()} =====\n`;

            for (const variable of variables) {
                if (this.envVars.hasOwnProperty(variable.key)) {
                    const value = this.envVars[variable.key];
                    envContent += `${variable.key}=${value}\n`;
                }
            }

            envContent += '\n';
        }

        // Write file
        try {
            fs.writeFileSync(envFilePath, envContent);
            this.log('✅ .env file created successfully!', 'green');

            // Provide database-specific guidance
            if (this.envVars.DATABASE_URL && this.envVars.DATABASE_URL.includes('localhost')) {
                this.log('\n⚠️  Database Setup Required:', 'yellow');
                this.log('Your DATABASE_URL points to localhost. Make sure PostgreSQL is running:');
                this.log('  • macOS: brew services start postgresql');
                this.log('  • Ubuntu/Debian: sudo systemctl start postgresql');
                this.log('  • Docker: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres');
                this.log('  • Or use a cloud database like Neon, Supabase, or Railway');
            }

            this.log('\n📝 Next steps:', 'yellow');
            this.log('1. Review your .env file');
            this.log('2. Ensure your database is running');
            this.log('3. Run: npm run setup (to initialize database)');
            this.log('4. Run: npm start (to start the server)');
            this.log('\n🎉 Cairo is ready to go!', 'green');
        } catch (error) {
            this.log(`❌ Error writing .env file: ${error.message}`, 'red');
        }
    }
}

// Run the setup
if (require.main === module) {
    const setup = new EnvSetup();
    setup.setup().catch(console.error);
}

module.exports = EnvSetup;