package app.caulky.mobile;

/** Widget del escritorio: gastos, ingresos y ahorro del mes. */
public class MonthWidget extends WidgetUpdater.Base {
    @Override
    String kind() {
        return Widgets.MONTH;
    }
}
