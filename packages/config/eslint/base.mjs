export default [
  {
    rules: {
      // The rule that keeps 100+ products from turning into a distributed ball of mud:
      // a product may never import another product's internals. Cross-product traffic
      // goes through the event bus or a published service interface only.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/products/*/internal/**', '**/products/*/repositories/**'],
              message:
                'Cross-product imports are forbidden. Publish an event or expose a service interface in the product public API.',
            },
          ],
        },
      ],
    },
  },
];
