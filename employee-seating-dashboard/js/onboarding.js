/**
 * onboarding.js
 * First-launch onboarding (7 steps). Shown once; the "done" flag lives in
 * localStorage. Empty-state texts are handled inline by each tab renderer.
 */
window.App = window.App || {};

App.onboarding = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;

  function maybeShow() {
    if (App.persistence.isOnboardingDone()) {
      return;
    }
    show();
  }

  function show() {
    var list = U.el('ol', { class: 'onboarding-steps' });
    C.ONBOARDING_STEPS.forEach(function (step) {
      list.appendChild(U.el('li', { text: step }));
    });

    App.modals.open({
      title: 'Добро пожаловать в «Дашборд рассадки сотрудников»',
      body: U.el('div', {}, [
        U.el('p', { text: 'Краткие шаги для начала работы:' }),
        list,
        U.el('p', { class: 'muted', text: 'Можно работать без списка сотрудников — только по командам и численности.' })
      ]),
      buttons: [
        {
          label: 'Начать',
          kind: 'primary',
          autofocus: true,
          onClick: function () {
            App.persistence.markOnboardingDone();
            return true;
          }
        }
      ],
      onClose: function () {
        App.persistence.markOnboardingDone();
      }
    });
  }

  return {
    maybeShow: maybeShow,
    show: show
  };
})();
