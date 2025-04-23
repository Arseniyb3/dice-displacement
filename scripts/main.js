Hooks.once('diceSoNiceReady', (dice3d) => {
    // Сохраняем оригинальный метод
    const originalApplyShader = dice3d.DiceFactory.ShaderUtils.applyDiceSoNiceShader;

    // Переопределяем метод applyDiceSoNiceShader
    dice3d.DiceFactory.ShaderUtils.applyDiceSoNiceShader = function (material) {
        // Вызываем оригинальный метод
        originalApplyShader.apply(this, arguments);

        // Добавляем поддержку Displacement Maps
        if (this.userData.displacementMaps && this.userData.displacementMaps.length > 0) {
            material.uniforms.displacementMap = { value: this.userData.displacementMaps[0].source };
            material.uniforms.displacementScale = { value: this.userData.displacementScale || 1.0 };
            material.uniforms.displacementBias = { value: this.userData.displacementBias || 0.0 };

            // Модифицируем вершинный шейдер
            material.vertexShader = `
                #ifdef USE_DISPLACEMENTMAP
                    uniform sampler2D displacementMap;
                    uniform float displacementScale;
                    uniform float displacementBias;
                #endif
                ${material.vertexShader}
            `.replace(
                '#include <displacementmap_vertex>',
                `
                #ifdef USE_DISPLACEMENTMAP
                    vec3 transformed = position;
                    transformed += normal * (texture2D(displacementMap, vUv).r * displacementScale + displacementBias);
                #endif
                `
            );

            // Устанавливаем флаг для использования карты смещения
            material.defines = material.defines || {};
            material.defines.USE_DISPLACEMENTMAP = '';
            material.needsUpdate = true;
        }
    };

    // Расширяем класс DicePreset
    const originalDicePreset = dice3d.DiceFactory.DicePreset.prototype;
    originalDicePreset.displacementMaps = [];
    originalDicePreset.displacementScale = 1.0;
    originalDicePreset.displacementBias = 0.0;

    originalDicePreset.setDisplacementMaps = function (maps) {
        this.displacementMaps = maps;
        this.unloadModel();
    };

    // Переопределяем метод loadTextures для загрузки displacementMaps
    const originalLoadTextures = originalDicePreset.loadTextures;
    originalDicePreset.loadTextures = async function () {
        const result = await originalLoadTextures.apply(this, arguments);
        if (this.displacementMaps && this.displacementMaps.length > 0) {
            const loader = new dice3d.DiceFactory.AssetsLoader();
            let textures = {};
            if (this.atlas) {
                let atlas = await loader.load(this.atlas);
                atlas = atlas[this.atlas];
                textures.displacementMaps = await this.loadTextureType(this.displacementMaps, atlas, loader);
            } else {
                textures.displacementMaps = await this.loadTextureType(this.displacementMaps, {}, loader);
            }
            this.registerFaces(textures);
        }
        return result;
    };

    // Обновляем registerFaces для поддержки displacementMaps
    const originalRegisterFaces = originalDicePreset.registerFaces;
    originalDicePreset.registerFaces = function (textures) {
        originalRegisterFaces.apply(this, arguments);
        if (textures.displacementMaps && Object.keys(textures.displacementMaps).length > 0) {
            this.displacementMaps = textures.displacementMaps;
        }
    };

    // Добавляем поддержку Displacement Maps в UI
    Hooks.on('renderDiceConfig', (app, html, data) => {
        // Добавляем поля в шаблон настройки кубиков
        html.find('.tabAppearance').each((i, tab) => {
            const diceType = $(tab).data('tab');
            const displacementFields = `
                <div class="form-group">
                    <label>${game.i18n.localize('DICE_DISPLACEMENT.DisplacementMap')}</label>
                    <input type="text" name="appearance[${diceType}][displacementMap]" data-displacementMap value="${data.appearance[diceType]?.displacementMap || ''}">
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize('DICE_DISPLACEMENT.DisplacementScale')}</label>
                    <input type="number" step="0.01" name="appearance[${diceType}][displacementScale]" data-displacementScale value="${data.appearance[diceType]?.displacementScale || 1.0}">
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize('DICE_DISPLACEMENT.DisplacementBias')}</label>
                    <input type="number" step="0.01" name="appearance[${diceType}][displacementBias]" data-displacementBias value="${data.appearance[diceType]?.displacementBias || 0.0}">
                </div>
            `;
            $(tab).append(displacementFields);
        });

        // Обновляем getShowcaseAppearance
        const originalGetShowcaseAppearance = app.getShowcaseAppearance;
        app.getShowcaseAppearance = function () {
            const result = originalGetShowcaseAppearance.apply(this, arguments);
            html.find('.tabAppearance').each((i, tab) => {
                const diceType = $(tab).data('tab');
                result.appearance[diceType] = result.appearance[diceType] || {};
                result.appearance[diceType].displacementMap = $(tab).find(`[data-displacementMap]`).val();
                result.appearance[diceType].displacementScale = parseFloat($(tab).find(`[data-displacementScale]`).val()) || 1.0;
                result.appearance[diceType].displacementBias = parseFloat($(tab).find(`[data-displacementBias]`).val()) || 0.0;
            });
            return result;
        };
    });
});