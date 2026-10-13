package app.caulky.mobile;

/** Widget del escritorio: cómo van los presupuestos. */
public class BudgetsWidget extends WidgetUpdater.Base {
    @Override
    String kind() {
        return Widgets.BUDGETS;
    }
}
